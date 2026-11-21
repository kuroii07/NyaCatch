/** Compatible containers for a direct copy of the first audio stream. */
export function originalAudioExtension(codec: string): string | undefined {
  if (["aac", "alac"].includes(codec)) return "m4a";
  if (["mp3", "flac", "opus", "ac3", "eac3", "dts", "mp2"].includes(codec))
    return codec;
  if (codec === "vorbis") return "ogg";
  if (
    [
      "pcm_u8",
      "pcm_s16le",
      "pcm_s24le",
      "pcm_s32le",
      "pcm_f32le",
      "pcm_f64le",
    ].includes(codec)
  )
    return "wav";
}
