package app.nanoplayer.mobile

import org.junit.Assert.*
import org.junit.Test

class ScanFingerprintTest {
    @Test fun unchangedAudioAndLyricsReuseMetadata() {
        val key = scanFingerprint(40, 10, "lyrics", 12, 11)
        assertTrue(canReuseScan(10, 11, key, key))
        assertFalse(canReuseScan(10, 12, key, scanFingerprint(40, 10, "lyrics", 12, 12)))
        assertFalse(canReuseScan(10, null, key, scanFingerprint(40, 10, null, null, null)))
        assertFalse(canReuseScan(12, 11, key, scanFingerprint(40, 12, "lyrics", 12, 11)))
    }
    @Test fun unknownProviderDatesAndLegacyKeysForceRead() {
        assertFalse(canReuseScan(0, null, "40:0:::0", "40:0:::0"))
        assertFalse(canReuseScan(10, 0, "same", "same"))
        assertFalse(canReuseScan(10, null, "40:10", scanFingerprint(40, 10, null, null, null)))
    }
}
