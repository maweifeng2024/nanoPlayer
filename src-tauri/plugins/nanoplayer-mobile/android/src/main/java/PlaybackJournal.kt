package app.nanoplayer.mobile

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

/** Native single-writer checkpoint store. Never opens or modifies source audio. */
class PlaybackJournal(context: Context, name: String = "playback-journal.sqlite3") : SQLiteOpenHelper(context, name, null, 4) {
    private var lastQueue: org.json.JSONArray? = null
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE checkpoint (id INTEGER PRIMARY KEY CHECK(id=1), snapshot TEXT NOT NULL)")
        db.execSQL("CREATE TABLE queue_snapshot (id INTEGER PRIMARY KEY CHECK(id=1), queue TEXT NOT NULL)")
        db.execSQL("CREATE TABLE sessions (id TEXT PRIMARY KEY, track_id TEXT NOT NULL, listened_ms INTEGER NOT NULL, counted INTEGER NOT NULL, exported INTEGER NOT NULL DEFAULT 0, started_at INTEGER NOT NULL DEFAULT 0)")
    }
    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {
        if (old < 2) db.execSQL("ALTER TABLE sessions ADD COLUMN exported INTEGER NOT NULL DEFAULT 0")
        if (old < 4) db.execSQL("ALTER TABLE sessions ADD COLUMN started_at INTEGER NOT NULL DEFAULT 0")
        if (old < 3) db.execSQL("CREATE TABLE IF NOT EXISTS queue_snapshot (id INTEGER PRIMARY KEY CHECK(id=1), queue TEXT NOT NULL)")
    }
    override fun onOpen(db: SQLiteDatabase) { super.onOpen(db); db.execSQL("CREATE INDEX IF NOT EXISTS pending_sessions ON sessions(exported)") }
    fun restore(): JSONObject? = readableDatabase.rawQuery("SELECT snapshot FROM checkpoint WHERE id=1", null).use {
        if (it.moveToFirst()) runCatching {
            val snapshot = JSONObject(it.getString(0))
            if (!snapshot.has("queue")) readableDatabase.rawQuery("SELECT queue FROM queue_snapshot WHERE id=1", null).use { cursor ->
                if (cursor.moveToFirst()) snapshot.put("queue", org.json.JSONArray(cursor.getString(0)))
            }
            snapshot
        }.getOrNull() else null
    }
    fun pendingEvents(): org.json.JSONArray {
        val result = org.json.JSONArray()
        readableDatabase.rawQuery("SELECT id, track_id, listened_ms, counted, started_at FROM sessions WHERE exported=0 LIMIT 1000", null).use {
            while (it.moveToNext()) result.put(JSONObject().put("sessionId", it.getString(0)).put("trackId", it.getString(1)).put("listenedMs", it.getLong(2)).put("counted", it.getInt(3) == 1).put("startedAt", (it.getLong(4) / 1000).toString()))
        }
        return result
    }
    fun acknowledge(events: org.json.JSONArray) {
        writableDatabase.beginTransaction()
        try {
            for (i in 0 until events.length()) {
                val event = events.getJSONObject(i)
                writableDatabase.execSQL("UPDATE sessions SET exported=1 WHERE id=? AND listened_ms=? AND counted=?", arrayOf(event.getString("sessionId"), event.getLong("listenedMs"), if(event.getBoolean("counted")) 1 else 0))
            }
            writableDatabase.setTransactionSuccessful()
        } finally { writableDatabase.endTransaction() }
    }
    fun playCounts(): JSONObject {
        val result = JSONObject()
        readableDatabase.rawQuery("SELECT track_id, SUM(counted) FROM sessions GROUP BY track_id", null).use {
            while (it.moveToNext()) result.put(it.getString(0), it.getLong(1))
        }
        return result
    }
    fun save(snapshot: JSONObject, session: String, track: String, listened: Long, counted: Boolean) {
        writableDatabase.beginTransaction()
        try {
            val queue = snapshot.optJSONArray("queue")
            if (queue != null && queue !== lastQueue) {
                writableDatabase.execSQL("INSERT OR REPLACE INTO queue_snapshot VALUES(1, ?)", arrayOf(queue.toString()))
            }
            snapshot.remove("queue")
            writableDatabase.execSQL("INSERT OR REPLACE INTO checkpoint VALUES(1, ?)", arrayOf(snapshot.toString()))
            if (track.isNotEmpty()) writableDatabase.execSQL(
                "INSERT INTO sessions(id,track_id,listened_ms,counted,started_at) VALUES(?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET exported=CASE WHEN excluded.listened_ms>listened_ms OR excluded.counted>counted THEN 0 ELSE exported END, listened_ms=MAX(listened_ms, excluded.listened_ms), counted=MAX(counted, excluded.counted)",
                arrayOf(session, track, listened, if (counted) 1 else 0, snapshot.optLong("startedAt", System.currentTimeMillis())))
            writableDatabase.setTransactionSuccessful()
            lastQueue = queue
        } finally { writableDatabase.endTransaction() }
    }
}
