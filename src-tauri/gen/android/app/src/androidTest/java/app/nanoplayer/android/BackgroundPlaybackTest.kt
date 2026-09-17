package app.nanoplayer.android

import android.content.ComponentName
import android.content.Intent
import androidx.core.content.FileProvider
import android.os.Looper
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.media3.common.MediaItem
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
            assertArrayEquals("Source audio must remain byte-identical", digest,
                MessageDigest.getInstance("SHA-256").digest(input.readBytes()))
        } finally {
            instrumentation.runOnMainSync { controller.pause(); controller.clearMediaItems(); controller.release() }
            scenario.close()
        }
    }
}
