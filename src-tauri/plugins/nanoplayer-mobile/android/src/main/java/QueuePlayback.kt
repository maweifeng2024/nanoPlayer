package app.nanoplayer.mobile

import androidx.media3.common.C
import androidx.media3.common.Player

/** Rewind the existing timeline; replacing a MediaItem would discard its queue. */
fun resumeQueue(player: Player) {
    if (player.playbackState == Player.STATE_ENDED) {
        val first = player.currentTimeline.getFirstWindowIndex(player.shuffleModeEnabled)
        if (first != C.INDEX_UNSET) player.seekToDefaultPosition(first)
    }
    player.prepare()
    player.play()
}
