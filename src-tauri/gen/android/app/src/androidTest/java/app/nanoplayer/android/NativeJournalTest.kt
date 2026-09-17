package app.nanoplayer.android

import androidx.test.platform.app.InstrumentationRegistry
import app.nanoplayer.mobile.PlaybackJournal
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeJournalTest {
    @Test fun acknowledgementCannotLoseNewerProgressAndQueueRestores() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "journal-test-${java.util.UUID.randomUUID()}.sqlite3"
        val queue = JSONArray().put(JSONObject().put("id", "42").put("uri", "content://fixture/42"))
        try {
            PlaybackJournal(context, name).use { journal ->
                fun save(listened: Long, counted: Boolean) = journal.save(JSONObject().put("queue", queue).put("positionMs", listened).put("startedAt", 1700000000123L), "session", "42", listened, counted)
                save(1000, false)
                val stale = journal.pendingEvents()
                save(2000, true)
                journal.acknowledge(stale)
                assertEquals(1, journal.pendingEvents().length())
                val current = journal.pendingEvents()
                assertTrue(current.getJSONObject(0).getBoolean("counted"))
                assertEquals("1700000000", current.getJSONObject(0).getString("startedAt"))
                journal.acknowledge(current)
                assertEquals(0, journal.pendingEvents().length())
                save(2000, true)
                assertEquals(0, journal.pendingEvents().length())
            }
            PlaybackJournal(context, name).use { restored ->
                assertEquals("42", restored.restore()!!.getJSONArray("queue").getJSONObject(0).getString("id"))
                assertEquals(2000L, restored.restore()!!.getLong("positionMs"))
            }
        } finally { context.deleteDatabase(name) }
    }

    @Test fun legacyJournalUpgradePreservesQueueAndPendingCounts() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "journal-upgrade-${java.util.UUID.randomUUID()}.sqlite3"
        try {
            context.openOrCreateDatabase(name, 0, null).use { database ->
                database.execSQL("CREATE TABLE checkpoint (id INTEGER PRIMARY KEY CHECK(id=1), snapshot TEXT NOT NULL)")
                database.execSQL("CREATE TABLE sessions (id TEXT PRIMARY KEY, track_id TEXT NOT NULL, listened_ms INTEGER NOT NULL, counted INTEGER NOT NULL)")
                database.execSQL("INSERT INTO checkpoint VALUES(1, ?)", arrayOf("""{"queue":[{"id":"42","uri":"content://fixture/42"}],"positionMs":1500}"""))
                database.execSQL("INSERT INTO sessions VALUES('legacy', '42', 1500, 1)")
                database.version = 1
            }
            PlaybackJournal(context, name).use { journal ->
                assertEquals("42", journal.restore()!!.getJSONArray("queue").getJSONObject(0).getString("id"))
                assertEquals(1500L, journal.restore()!!.getLong("positionMs"))
                val events = journal.pendingEvents()
                assertEquals(1, events.length())
                assertTrue(events.getJSONObject(0).getBoolean("counted"))
                assertEquals("0", events.getJSONObject(0).getString("startedAt"))
                journal.acknowledge(events)
            }
            PlaybackJournal(context, name).use { journal ->
                assertEquals(0, journal.pendingEvents().length())
                assertEquals(1, journal.playCounts().getInt("42"))
            }
        } finally { context.deleteDatabase(name) }
    }
}
