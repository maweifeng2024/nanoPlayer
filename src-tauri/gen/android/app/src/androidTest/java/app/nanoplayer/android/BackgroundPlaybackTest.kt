package app.nanoplayer.android

import android.content.ComponentName
import android.content.Intent
import androidx.core.content.FileProvider
import android.os.Looper
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.C
import app.nanoplayer.mobile.resumeQueue
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class BackgroundPlaybackTest {
    @Test fun nativeQueueCompletesWithoutWebViewAndPreservesSource() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val first = "native-test-" + java.util.UUID.randomUUID()
        val second = "native-test-" + java.util.UUID.randomUUID()
        val input = File(context.cacheDir, "native-read-only-fixture.wav")
        val pcmBytes = 16000 * 2 * 2
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
            .put("RIFF".toByteArray()).putInt(pcmBytes + 36).put("WAVEfmt ".toByteArray())
            .putInt(16).putShort(1).putShort(1).putInt(16000).putInt(32000)
            .putShort(2).putShort(16).put("data".toByteArray()).putInt(pcmBytes).array()
        input.writeBytes(header + ByteArray(pcmBytes))
        val contentUri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", input)
        val digest = MessageDigest.getInstance("SHA-256").digest(input.readBytes())
        val scenario = ActivityScenario.launch<MainActivity>(Intent(context, MainActivity::class.java))
        val future = MediaController.Builder(context, SessionToken(context,
            ComponentName(context.packageName, "app.nanoplayer.mobile.PlaybackService")))
            .setApplicationLooper(Looper.getMainLooper()).buildAsync()
        val controller = future.get(30, TimeUnit.SECONDS)
        try {
            instrumentation.runOnMainSync {
                controller.setMediaItems(listOf(
                    MediaItem.Builder().setMediaId(first).setUri(contentUri).build(),
                    MediaItem.Builder().setMediaId(second).setUri(contentUri).build()))
                controller.prepare()
                controller.play()
            }
            // Destroy the Activity/WebView; the service must still transition and persist.
            Thread.sleep(700)
            scenario.close()
            val deadline = System.currentTimeMillis() + 15000
            var counted = 0
            while (System.currentTimeMillis() < deadline) {
                val dbPath = context.getDatabasePath("playback-journal.sqlite3")
                if (dbPath.exists()) {
                    android.database.sqlite.SQLiteDatabase.openDatabase(dbPath.path, null,
                        android.database.sqlite.SQLiteDatabase.OPEN_READONLY).use { db ->
                        db.rawQuery("SELECT COUNT(*) FROM sessions WHERE track_id IN (?, ?) AND counted=1", arrayOf(first, second)).use {
                            it.moveToFirst(); counted = it.getInt(0)
                        }
                    }
                }
                if (counted >= 2) break
                Thread.sleep(250)
            }
            assertEquals("Both native transitions must count once with no WebView", 2, counted)
            instrumentation.runOnMainSync {
                assertEquals(Player.STATE_ENDED, controller.playbackState)
                resumeQueue(controller)
                assertEquals("Replay must keep the full playlist", 2, controller.mediaItemCount)
                assertEquals("Replay starts a new playlist round", first, controller.currentMediaItem?.mediaId)
            }
            // Repeat-off must still reach the second item on this replay.
            Thread.sleep(2400)
            instrumentation.runOnMainSync {
                assertEquals(second, controller.currentMediaItem?.mediaId)
            }
            instrumentation.runOnMainSync {
                controller.pause()
                controller.setMediaItems((0 until 6).map { index ->
                    MediaItem.Builder().setMediaId("$first-shuffle-$index").setUri(contentUri).build()
                }, 3, 0)
                controller.shuffleModeEnabled = true
            }
            val shuffleDeadline = System.currentTimeMillis() + 5000
            var firstIndex = -1
            while (System.currentTimeMillis() < shuffleDeadline) {
                instrumentation.runOnMainSync {
                    firstIndex = controller.currentTimeline.getFirstWindowIndex(true)
                }
                if (firstIndex == 3) break
                Thread.sleep(50)
            }
            instrumentation.runOnMainSync {
                assertEquals("Shuffle round is anchored at the current song", 3, firstIndex)
                val indices = mutableListOf<Int>()
                var cursor = firstIndex
                while (cursor != C.INDEX_UNSET && indices.size < 7) {
                    indices.add(cursor)
                    cursor = controller.currentTimeline.getNextWindowIndex(cursor, Player.REPEAT_MODE_OFF, true)
                }
                assertEquals("Shuffle must visit all six queue entries once", (0 until 6).toSet(), indices.toSet())
                assertEquals(6, indices.size)
                controller.seekToNextMediaItem()
                assertEquals(indices[1], controller.currentMediaItemIndex)
            }
            assertArrayEquals("Source audio must remain byte-identical", digest,
                MessageDigest.getInstance("SHA-256").digest(input.readBytes()))
        } finally {
            instrumentation.runOnMainSync { controller.pause(); controller.clearMediaItems(); controller.release() }
            scenario.close()
        }
    }
}
