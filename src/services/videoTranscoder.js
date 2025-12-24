const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs").promises;
const os = require("os");
const { v4: uuidv4 } = require("uuid");

// ✅ FORCE SYSTEM BINARIES (THIS FIXES EVERYTHING)
ffmpeg.setFfmpegPath("/usr/bin/ffmpeg");
ffmpeg.setFfprobePath("/usr/bin/ffprobe");

/**
 * Transcode video to Baseline Profile Level 3.1 (Flutter / Android safe)
 */
const transcodeVideo = (inputPath, outputDir = null) => {
  return new Promise(async (resolve, reject) => {
    let outputPath;

    try {
      await fs.access(inputPath);

      const finalOutputDir =
        outputDir || path.join(os.tmpdir(), "video_transcoding");
      await fs.mkdir(finalOutputDir, { recursive: true });

      outputPath = path.join(
        finalOutputDir,
        `transcoded_${uuidv4()}.mp4`
      );

      // 🔍 GET METADATA (ffprobe)
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          console.error("Error getting video metadata:", err);
          return reject(
            new Error("Failed to get video metadata: " + err.message)
          );
        }

        const videoStream = metadata.streams.find(
          (s) => s.codec_type === "video"
        );

        const originalWidth = videoStream?.width || 1280;
        const originalHeight = videoStream?.height || 720;

        let targetWidth = originalWidth;
        let targetHeight = originalHeight;

        if (originalWidth > 1280 || originalHeight > 720) {
          const scale = Math.min(
            1280 / originalWidth,
            720 / originalHeight
          );
          targetWidth = Math.floor((originalWidth * scale) / 2) * 2;
          targetHeight = Math.floor((originalHeight * scale) / 2) * 2;
        }

        ffmpeg(inputPath)
          .videoCodec("libx264")
          .audioCodec("aac")
          .outputOptions([
            "-profile:v baseline",
            "-level 3.1",
            "-pix_fmt yuv420p",
            "-r 30",
            "-movflags +faststart",
            "-preset fast",
            "-crf 23",
            "-maxrate 10M",
            "-bufsize 20M",
            "-x264-params keyint=30:min-keyint=30:scenecut=0"
          ])
          .size(`${targetWidth}x${targetHeight}`)
          .on("start", (cmd) => {
            console.log("[VideoTranscoder] FFmpeg started");
            console.log(cmd);
          })
          .on("end", async () => {
            const stats = await fs.stat(outputPath);
            resolve({
              outputPath,
              duration: metadata.format.duration,
              width: targetWidth,
              height: targetHeight,
              fileSize: stats.size
            });
          })
          .on("error", async (err) => {
            console.error("[VideoTranscoder] FFmpeg error:", err);
            await cleanupFile(outputPath);
            reject(new Error("Video transcoding failed: " + err.message));
          })
          .save(outputPath);
      });
    } catch (err) {
      await cleanupFile(outputPath);
      reject(err);
    }
  });
};

const isVideo = (mimetype) => mimetype?.startsWith("video/");

const cleanupFile = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (_) {}
};

module.exports = {
  transcodeVideo,
  isVideo,
  cleanupFile
};
