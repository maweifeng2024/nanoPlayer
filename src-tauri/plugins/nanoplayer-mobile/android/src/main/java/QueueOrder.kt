package app.nanoplayer.mobile

import kotlin.random.Random

/** Start a shuffle round at the current item so no unplayed prefix is skipped. */
internal fun shuffledQueueIndices(count: Int, current: Int, random: Random = Random.Default): IntArray {
    if (count == 0) return intArrayOf()
    val first = current.coerceIn(0, count - 1)
    return (listOf(first) + (0 until count).filter { it != first }.shuffled(random)).toIntArray()
}
