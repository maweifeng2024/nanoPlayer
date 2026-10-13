package app.nanoplayer.mobile

/** Replace ranges around the current item, keeping its source and position alive.
 * At most two controller calls, even when thousands of entries disappear/reorder.
 * Apply the suffix first so the original current index still anchors the prefix.
 */
internal data class QueueReplacement(val from: Int, val to: Int, val itemsFrom: Int, val itemsTo: Int)

internal fun queueReplacements(old: List<String>, next: List<String>, current: Int): List<QueueReplacement> {
    if (old == next) return emptyList()
    val anchor = old.getOrNull(current)?.let { next.indexOf(it) } ?: -1
    if (anchor < 0) return listOf(QueueReplacement(0, old.size, 0, next.size))
    val result = mutableListOf<QueueReplacement>()
    if (old.subList(current + 1, old.size) != next.subList(anchor + 1, next.size))
        result.add(QueueReplacement(current + 1, old.size, anchor + 1, next.size))
    if (old.subList(0, current) != next.subList(0, anchor))
        result.add(QueueReplacement(0, current, 0, anchor))
    return result
}
