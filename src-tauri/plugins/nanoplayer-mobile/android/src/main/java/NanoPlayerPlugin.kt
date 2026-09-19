package app.nanoplayer.mobile

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import androidx.documentfile.provider.DocumentFile
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import java.util.concurrent.Executors

@InvokeArg
class NativeArgs {
    var action: String = "snapshot"
    var color: String = "#18181b"
    var light: Boolean = false
    var queue: String = "[]"
    var uri: String = ""
    var index: Int = 0
    var positionMs: Long = 0
    var enabled: Boolean = false
    var repeatMode: Int = 0
    var volume: Float = 1f
    var kind: String = "lyrics"
    var events: String = "[]"
}

@TauriPlugin
class NanoPlayerPlugin(private val activity: Activity) : Plugin(activity) {
    private val scanCancelled = java.util.concurrent.atomic.AtomicBoolean(false)
    private val worker = Executors.newSingleThreadExecutor()
    private val controllerDelegate = lazy {
        MediaController.Builder(activity, SessionToken(activity, ComponentName(activity, PlaybackService::class.java))).buildAsync()
    }
    private val controller by controllerDelegate

    override fun onDestroy(activity: androidx.appcompat.app.AppCompatActivity) {
        if (controllerDelegate.isInitialized()) MediaController.releaseFuture(controller)
        worker.shutdownNow()
        super.onDestroy(activity)
    }

    @Command
    fun dispatch(invoke: Invoke) {
        val args = invoke.parseArgs(NativeArgs::class.java)
        when (args.action) {
            "acknowledge" -> { PlaybackJournal(activity).use { it.acknowledge(JSONArray(args.events)) }; invoke.resolve(JSObject()) }
            "systemBars" -> {
                val color = try { android.graphics.Color.parseColor(args.color) } catch (_: IllegalArgumentException) { invoke.reject("Invalid surface color"); return }
                activity.runOnUiThread {
                    activity.findViewById<android.view.View>(android.R.id.content).setBackgroundColor(color)
                    @Suppress("DEPRECATION")
                    activity.window.statusBarColor = android.graphics.Color.TRANSPARENT
                    @Suppress("DEPRECATION")
                    activity.window.navigationBarColor = android.graphics.Color.TRANSPARENT
                    if (android.os.Build.VERSION.SDK_INT >= 29) activity.window.isNavigationBarContrastEnforced = false
                    androidx.core.view.WindowInsetsControllerCompat(activity.window, activity.window.decorView).apply {
                        isAppearanceLightStatusBars = args.light
                        isAppearanceLightNavigationBars = args.light
                    }
                    invoke.resolve(JSObject())
                }
            }
            "deviceInfo" -> {
                val metrics = activity.resources.displayMetrics
                val bounds = if (android.os.Build.VERSION.SDK_INT >= 30) activity.windowManager.maximumWindowMetrics.bounds else null
                val shortest = if (bounds != null) minOf(bounds.width(), bounds.height()) / metrics.density else minOf(metrics.widthPixels, metrics.heightPixels) / metrics.density
                val info = JSObject(); info.put("tablet", shortest >= 600)
                val pkg = activity.packageManager.getPackageInfo(activity.packageName, 0)
                info.put("versionName", pkg.versionName); info.put("versionCode", pkg.longVersionCode); invoke.resolve(info)
            }
            "background" -> { activity.moveTaskToBack(true); invoke.resolve(JSObject()) }
            "audioSettings" -> {
                val opened = android.os.Build.VERSION.SDK_INT >= 34 && android.media.MediaRouter2.getInstance(activity).showSystemOutputSwitcher()
                if (!opened) activity.startActivity(Intent(android.provider.Settings.ACTION_SOUND_SETTINGS))
                invoke.resolve(JSObject())
            }
            "pickFile" -> {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(if (args.kind == "cover") "image/*" else "*/*")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                startActivityForResult(invoke, intent, "fileResult")
            }
            "pickTree" -> {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
                startActivityForResult(invoke, intent, "treeResult")
            }
            "cancelScan" -> { scanCancelled.set(true); invoke.resolve(JSObject()) }
            "scanTree" -> worker.execute {
                scanCancelled.set(false)
                try { invoke.resolve(scan(args.uri)) } catch (e: Exception) { invoke.reject(e.message ?: "Unable to read folder") }
            }
            else -> controller.addListener({
                try {
                    val player = controller.get()
                    when (args.action) {
                        "setQueue", "updateQueue" -> {
                            val queue = JSONArray(args.queue)
                            require(queue.length() in 0..10000) { "Queue size must be 1–10000" }
                            require(queue.length() == 0 || args.index in 0 until queue.length()) { "Invalid queue index" }
                            val items = (0 until queue.length()).map { i ->
                                val entry = queue.getJSONObject(i)
                                val uri = Uri.parse(entry.getString("uri"))
                                require(uri.scheme == "content") { "Only user-selected content URIs are allowed" }
                                // Read-only check: Android grants enforce provider access, no guessed paths.
                                require(activity.checkUriPermission(uri, android.os.Process.myPid(), android.os.Process.myUid(),
                                    Intent.FLAG_GRANT_READ_URI_PERMISSION) == android.content.pm.PackageManager.PERMISSION_GRANTED) { "Audio permission expired" }
                                MediaItem.Builder().setMediaId(entry.getString("id")).setUri(uri)
                                    .setMediaMetadata(MediaMetadata.Builder().setTitle(entry.optString("title"))
                                        .setArtist(entry.optString("artist")).build()).build()
                            }
                            if (items.isEmpty()) player.clearMediaItems()
                            else if (args.action == "updateQueue") {
                                for ((index, item) in items.withIndex()) {
                                    val found = (index until player.mediaItemCount).firstOrNull { player.getMediaItemAt(it).mediaId == item.mediaId }
                                    if (found == null) player.addMediaItem(index, item)
                                    else if (found != index) player.moveMediaItem(found, index)
                                }
                                if (player.mediaItemCount > items.size) player.removeMediaItems(items.size, player.mediaItemCount)
                            } else {
                                player.setMediaItems(items, args.index, args.positionMs.coerceAtLeast(0))
                                player.prepare()
                                player.playWhenReady = args.enabled
                            }
                        }
                        "play" -> resumeQueue(player)
                        "pause" -> player.pause()
                        "seek" -> player.seekTo(args.positionMs.coerceAtLeast(0))
                        "volume" -> { require(args.volume.isFinite()); player.volume = args.volume.coerceIn(0f, 1f) }
                        "next" -> player.seekToNextMediaItem()
                        "previous" -> player.seekToPreviousMediaItem()
                        "shuffle" -> player.shuffleModeEnabled = args.enabled
                        "repeat" -> {
                            require(args.repeatMode in Player.REPEAT_MODE_OFF..Player.REPEAT_MODE_ALL)
                            player.repeatMode = args.repeatMode
                        }
                        "removeTree" -> {
                            for (i in player.mediaItemCount - 1 downTo 0) {
                                if (player.getMediaItemAt(i).localConfiguration?.uri.toString().startsWith(args.uri + "/")) player.removeMediaItem(i)
                            }
                            runCatching { activity.contentResolver.releasePersistableUriPermission(Uri.parse(args.uri), Intent.FLAG_GRANT_READ_URI_PERMISSION) }
                        }
                        "snapshot" -> Unit
                        else -> error("Unknown native action")
                    }
                    val queue = JSONArray()
                    for (i in 0 until player.mediaItemCount) queue.put(player.getMediaItemAt(i).mediaId)
                    val playbackOrder = JSONArray()
                    var cursor = player.currentTimeline.getFirstWindowIndex(player.shuffleModeEnabled)
                    while (cursor != C.INDEX_UNSET && playbackOrder.length() < player.mediaItemCount) {
                        playbackOrder.put(player.getMediaItemAt(cursor).mediaId)
                        cursor = player.currentTimeline.getNextWindowIndex(cursor, Player.REPEAT_MODE_OFF, player.shuffleModeEnabled)
                    }
                    val events = PlaybackJournal(activity).use { it.pendingEvents() }
                    val state = JSObject().put("queue", queue).put("events", events)
                        .put("playbackOrder", playbackOrder).put("ended", player.playbackState == Player.STATE_ENDED)
                        .put("shuffle", player.shuffleModeEnabled).put("repeatMode", player.repeatMode)
                        .put("playWhenReady", player.playWhenReady && player.playbackState != Player.STATE_ENDED).put("positionMs", player.currentPosition.coerceAtLeast(0))
                        .put("playing", player.isPlaying).put("trackId", player.currentMediaItem?.mediaId)
                        .put("index", player.currentMediaItemIndex).put("queueSize", player.mediaItemCount)
                        .put("durationMs", player.duration.coerceAtLeast(0))
                        .put("error", player.playerError?.errorCodeName)
                    invoke.resolve(state as JSObject)
                } catch (e: Exception) { invoke.reject(e.message ?: "Native playback failed") }
            }, ContextCompat.getMainExecutor(activity))
        }
    }

    @ActivityCallback
    fun treeResult(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) {
            val response = JSObject(); response.put("cancelled", true); invoke.resolve(response); return
        }
        try {
            val uri = result.data?.data ?: error("No folder returned")
            activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            val response = JSObject(); response.put("uri", uri.toString()); invoke.resolve(response)
        } catch (e: Exception) { invoke.reject(e.message ?: "Folder permission failed") }
    }

    @ActivityCallback
    fun fileResult(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) { invoke.resolve(JSObject()); return }
        worker.execute {
            try {
                val uri = result.data?.data ?: error("未选择文件")
                val kind = invoke.parseArgs(NativeArgs::class.java).kind
                val name = DocumentFile.fromSingleUri(activity, uri)?.name ?: ""
                val extension = name.substringAfterLast('.', "").lowercase()
                val allowed = if (kind == "cover") setOf("jpg", "jpeg", "png", "webp", "gif") else setOf("lrc", "txt")
                require(extension in allowed) { "文件格式不受支持" }
                val limit = if (kind == "cover") 8 * 1024 * 1024 else 2 * 1024 * 1024
                val destination = java.io.File(activity.cacheDir, "selected-import.$extension")
                try {
                    activity.contentResolver.openInputStream(uri)?.use { input ->
                        destination.outputStream().use { output ->
                            val buffer = ByteArray(8192); var total = 0
                            while (true) {
                                val count = input.read(buffer); if (count < 0) break
                                total += count; require(total <= limit) { "文件超过大小限制" }
                                output.write(buffer, 0, count)
                            }
                        }
                    } ?: error("无法读取所选文件")
                    val response = JSObject(); response.put("path", destination.absolutePath); invoke.resolve(response)
                } catch (e: Exception) { destination.delete(); throw e }
            } catch (e: Exception) { invoke.reject(e.message ?: "导入失败") }
        }
    }

    private fun scan(uriString: String): JSObject {
        val uri = Uri.parse(uriString)
        require(uri.scheme == "content")
        require(activity.contentResolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission }) {
            "Folder access expired; select it again"
        }
        val root = DocumentFile.fromTreeUri(activity, uri) ?: error("Folder unavailable")
        val pending = java.util.ArrayDeque<DocumentFile>(); pending.add(root)
        val seen = HashSet<String>(); val tracks = JSONArray(); val issues = JSONArray()
        while (pending.isNotEmpty()) {
            if (scanCancelled.get() || Thread.currentThread().isInterrupted) {
                val response = JSObject(); response.put("cancelled", true); return response
            }
            val directory = pending.removeFirst()
            require(directory.exists() && directory.canRead()) { "Folder permission expired or provider unavailable" }
            if (!seen.add(directory.uri.toString())) continue
            require(seen.size <= 10000) { "Folder limit exceeded" }
            val children = directory.listFiles()
            val lyrics = children.filter { it.name?.endsWith(".lrc", ignoreCase = true) == true }.associateBy { it.name!!.substringBeforeLast('.').lowercase() }
            for (file in children) {
                if (file.isDirectory) pending.add(file)
                else if (file.name?.substringAfterLast('.')?.lowercase() in setOf("mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "aiff", "aif", "alac")) {
                    require(tracks.length() < 100000) { "Track limit exceeded" }
                    val entry = org.json.JSONObject().put("uri", file.uri.toString()).put("name", file.name)
                        .put("documentId", android.provider.DocumentsContract.getDocumentId(file.uri))
                        .put("title", file.name?.substringBeforeLast('.') ?: "未知歌曲")
                        .put("artist", "未知艺术家").put("albumArtist", "未知艺术家").put("album", "未知专辑")
                        .put("format", file.name?.substringAfterLast('.')?.lowercase())
                        .put("sizeBytes", file.length()).put("modifiedAt", file.lastModified())
                    val metadata = android.media.MediaMetadataRetriever()
                    try {
                        metadata.setDataSource(activity, file.uri)
                        fun tag(key: Int, name: String) { metadata.extractMetadata(key)?.takeIf { it.isNotBlank() }?.let { entry.put(name, it) } }
                        tag(android.media.MediaMetadataRetriever.METADATA_KEY_TITLE, "title")
                        tag(android.media.MediaMetadataRetriever.METADATA_KEY_ARTIST, "artist")
                        tag(android.media.MediaMetadataRetriever.METADATA_KEY_ALBUM, "album")
                        tag(android.media.MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST, "albumArtist")
                        metadata.embeddedPicture?.takeIf { it.size <= 8 * 1024 * 1024 }?.let { picture ->
                            val key = java.security.MessageDigest.getInstance("SHA-256").digest(file.uri.toString().toByteArray()).joinToString("") { "%02x".format(it) }
                            val cache = java.io.File(activity.cacheDir, "scan-artwork").apply { mkdirs() }
                            val image = java.io.File(cache, key); image.writeBytes(picture)
                            entry.put("artworkPath", image.absolutePath)
                            val options = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
                            android.graphics.BitmapFactory.decodeByteArray(picture, 0, picture.size, options)
                            entry.put("artworkMime", options.outMimeType ?: "image/jpeg")
                        }
                        entry.put("durationMs", metadata.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0)
                        metadata.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_YEAR)?.toIntOrNull()?.let { entry.put("year", it) }
                    } catch (e: Exception) {
                        issues.put(org.json.JSONObject().put("uri", file.uri.toString()).put("detail", e.message ?: "无法读取音频元数据"))
                    } finally { metadata.release() }
                    lyrics[file.name?.substringBeforeLast('.')?.lowercase()]?.let { sidecar ->
                        try {
                            activity.contentResolver.openInputStream(sidecar.uri)?.use { input ->
                                val output = java.io.ByteArrayOutputStream()
                                val buffer = ByteArray(8192)
                                while (output.size() <= 1024 * 1024) {
                                    val read = input.read(buffer, 0, minOf(buffer.size, 1024 * 1024 + 1 - output.size()))
                                    if (read < 0) break
                                    output.write(buffer, 0, read)
                                }
                                val bytes = output.toByteArray()
                                require(bytes.size <= 1024 * 1024) { "歌词文件超过 1 MB" }
                                entry.put("lyrics", bytes.toString(Charsets.UTF_8).removePrefix("\uFEFF"))
                            }
                        } catch (e: Exception) {
                            issues.put(org.json.JSONObject().put("uri", sidecar.uri.toString()).put("detail", e.message ?: "无法读取歌词"))
                        }
                    }
                    tracks.put(entry)
                }
            }
        }
        val response = JSObject(); response.put("uri", uriString); response.put("tracks", tracks); response.put("issues", issues); response.put("name", root.name); return response
    }
}
