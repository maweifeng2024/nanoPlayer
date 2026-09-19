package app.nanoplayer.mobile

import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ShuffleOrder.DefaultShuffleOrder
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Owns the queue, natural transitions and durable progress even with no Activity/WebView. */
class PlaybackService : MediaSessionService() {
    private lateinit var player: ExoPlayer
    private lateinit var journal: PlaybackJournal
    private var session: MediaSession? = null
    private val handler = Handler(Looper.getMainLooper())
    private var queueSnapshot = JSONArray()
    private var queueTimeline: androidx.media3.common.Timeline? = null
    private var revision = 0L
    private var sessionId = UUID.randomUUID().toString()
    private var sessionStartedAt = System.currentTimeMillis()
    private var trackId = ""
    private var accounting = ListeningSession()
    private var durationMs = 0L
    private var lastTick = 0L
    private var wasPlaying = false
    private val tick = object : Runnable {
        override fun run() { checkpoint(); handler.postDelayed(this, 1000) }
    }

    override fun onCreate() {
        super.onCreate()
        journal = PlaybackJournal(this)
        player = ExoPlayer.Builder(this).build().apply {
            setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            setHandleAudioBecomingNoisy(true)
            setWakeMode(C.WAKE_MODE_LOCAL)
        }
        restore()
        player.addListener(object : Player.Listener {
            override fun onShuffleModeEnabledChanged(enabled: Boolean) {
                if (enabled) resetShuffleOrder()
            }
            override fun onMediaItemTransition(item: MediaItem?, reason: Int) {
                if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED && player.shuffleModeEnabled) resetShuffleOrder()
                checkpoint()
                trackId = item?.mediaId ?: ""
                sessionId = UUID.randomUUID().toString()
                sessionStartedAt = System.currentTimeMillis()
                accounting = ListeningSession()
                durationMs = 0
                revision++
                checkpoint()
            }
            override fun onPositionDiscontinuity(old: Player.PositionInfo, new: Player.PositionInfo, reason: Int) {
                checkpoint()
                if (reason == Player.DISCONTINUITY_REASON_SEEK) accounting.seeked = true
                if (reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION) accounting.complete(durationMs)
                checkpoint()
            }
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) { checkpoint(); accounting.complete(durationMs); checkpoint() }
            }
            override fun onIsPlayingChanged(isPlaying: Boolean) { checkpoint(); wasPlaying = isPlaying }
            override fun onEvents(p: Player, events: Player.Events) { revision++; if (player.duration > 0) durationMs = player.duration; checkpoint() }
        })
        session = MediaSession.Builder(this, player).build()
        lastTick = SystemClock.elapsedRealtime()
        handler.post(tick)
    }

    private fun resetShuffleOrder() {
        player.setShuffleOrder(DefaultShuffleOrder(
            shuffledQueueIndices(player.mediaItemCount, player.currentMediaItemIndex),
            System.nanoTime()))
    }

    private fun restore() {
        val saved = journal.restore() ?: return
        runCatching {
            val queue = saved.optJSONArray("queue") ?: JSONArray()
            val items = (0 until queue.length()).map { index ->
                val entry = queue.getJSONObject(index)
                MediaItem.Builder().setMediaId(entry.getString("id")).setUri(entry.getString("uri"))
                    .setMediaMetadata(MediaMetadata.Builder().setTitle(entry.optString("title"))
                        .setArtist(entry.optString("artist")).build()).build()
            }
            if (items.isNotEmpty()) {
                player.setMediaItems(items, saved.optInt("index", 0).coerceIn(0, items.lastIndex), saved.optLong("positionMs", 0))
                // Deliberately do not prepare/play: restart never starts audio by itself.
            }
            player.repeatMode = saved.optInt("repeatMode", Player.REPEAT_MODE_OFF)
            player.shuffleModeEnabled = saved.optBoolean("shuffle", false)
            trackId = saved.optString("trackId")
            sessionId = saved.optString("sessionId", UUID.randomUUID().toString())
            sessionStartedAt = saved.optLong("startedAt", System.currentTimeMillis())
            accounting = ListeningSession(saved.optLong("listenedMs"), saved.optBoolean("counted"), saved.optBoolean("seeked"))
            revision = saved.optLong("revision")
        }
    }

    private fun checkpoint() {
        val now = SystemClock.elapsedRealtime()
        if (lastTick > 0) accounting.advance(now - lastTick, wasPlaying)
        lastTick = now
        wasPlaying = player.isPlaying
        if (queueTimeline !== player.currentTimeline) {
            queueTimeline = player.currentTimeline
            val queue = JSONArray()
            for (i in 0 until player.mediaItemCount) {
                val item = player.getMediaItemAt(i)
                queue.put(JSONObject().put("id", item.mediaId).put("uri", item.localConfiguration?.uri.toString())
                    .put("title", item.mediaMetadata.title?.toString()).put("artist", item.mediaMetadata.artist?.toString()))
            }
            queueSnapshot = queue
        }
        val snapshot = JSONObject().put("queue", queueSnapshot).put("index", player.currentMediaItemIndex.coerceAtLeast(0))
            .put("positionMs", player.currentPosition.coerceAtLeast(0)).put("trackId", trackId)
            .put("sessionId", sessionId).put("startedAt", sessionStartedAt).put("listenedMs", accounting.listenedMs).put("counted", accounting.counted).put("seeked", accounting.seeked)
            .put("repeatMode", player.repeatMode).put("shuffle", player.shuffleModeEnabled)
            .put("revision", revision)
        journal.save(snapshot, sessionId, trackId, accounting.listenedMs, accounting.counted)
    }
    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session
    override fun onTaskRemoved(rootIntent: Intent?) {
        checkpoint()
        if (!player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }
    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        checkpoint()
        session?.release()
        player.release()
        journal.close()
        super.onDestroy()
    }
}
