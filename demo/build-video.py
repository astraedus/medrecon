#!/usr/bin/env python3
"""
Build the MedRecon demo video from screenshots + narration audio.

Each screenshot is shown for a calculated duration to match the narration pacing.
Uses ffmpeg to combine everything into a final MP4.
"""
import subprocess
import sys
from pathlib import Path

DEMO_DIR = Path(__file__).parent
SCREENSHOTS_DIR = DEMO_DIR / "screenshots"
AUDIO_FILE = DEMO_DIR / "audio" / "narration-44100.mp3"
OUTPUT_FILE = DEMO_DIR / "demo.mp4"
CONCAT_FILE = DEMO_DIR / "concat.txt"

# Screenshot timing: (filename, duration_seconds)
# Matched to narration script sections
FRAMES = [
    # Problem statement (0:00 - 0:28)
    ("01-dashboard-initial.png", 6),     # Stats could overlay here
    ("02-patient-selected.png", 8),      # "rebuilding from scratch..."

    # Intro + start reconciliation (0:28 - 0:48)
    ("02-patient-selected.png", 6),      # "MedRecon automates..."
    ("03-pipeline-collecting.png", 8),   # "Orchestrator dispatches Source Collector..."

    # Pipeline running (0:48 - 1:02)
    ("04-pipeline-analyzing.png", 7),    # "merges medication data..."
    ("05-pipeline-assembling.png", 7),   # "Interaction Checker runs..."

    # Report complete (1:02 - 1:40)
    ("07-report-complete.png", 8),       # "comprehensive reconciliation report..."
    ("08-report-patient-info.png", 8),   # "12 medications... 7 conditions..."
    ("09-report-safety.png", 10),        # "SEVERE: Simvastatin + Clarithromycin..."
    ("10-report-interactions.png", 12),  # "Sertraline + Tramadol... serotonin syndrome..."

    # Quick Scan mode (1:40 - 1:52)
    ("11-quickscan-results.png", 6),     # "Quick Scan mode..."
    ("12-quickscan-interactions.png", 6),# "interaction alerts sorted by severity..."

    # FHIR Bundle (1:52 - 2:12)
    ("13-fhir-bundle.png", 12),          # "FHIR R4 Bundle... MedicationStatement..."

    # Architecture (2:12 - 2:42) - reuse dashboard for now
    ("14-final.png", 18),                # "Three agents... A2A protocol... 8 tools..."

    # Close (2:42 - 2:55)
    ("14-final.png", 8),                 # "MedRecon catches them... every SEVERE flag..."
]

def get_audio_duration():
    """Get audio duration in seconds."""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(AUDIO_FILE)],
        capture_output=True, text=True
    )
    return float(result.stdout.strip())

def build_video():
    print("=== Building MedRecon Demo Video ===\n")

    # Check audio
    audio_duration = get_audio_duration()
    print(f"Audio duration: {audio_duration:.1f}s ({int(audio_duration//60)}:{int(audio_duration%60):02d})")

    total_frame_duration = sum(d for _, d in FRAMES)
    print(f"Frame duration: {total_frame_duration}s ({int(total_frame_duration//60)}:{int(total_frame_duration%60):02d})")

    # Adjust last frame to match audio exactly
    diff = audio_duration - (total_frame_duration - FRAMES[-1][1])
    FRAMES[-1] = (FRAMES[-1][0], max(1, int(diff) + 1))
    total_frame_duration = sum(d for _, d in FRAMES)
    print(f"Adjusted total: {total_frame_duration}s")

    # Create individual video segments for each screenshot
    segments = []
    for i, (filename, duration) in enumerate(FRAMES):
        img_path = SCREENSHOTS_DIR / filename
        if not img_path.exists():
            print(f"  WARNING: {filename} not found, skipping")
            continue

        seg_path = DEMO_DIR / f"seg_{i:02d}.mp4"
        segments.append(seg_path)

        # Create video segment from still image
        subprocess.run([
            "ffmpeg", "-y",
            "-loop", "1",
            "-i", str(img_path),
            "-c:v", "libx264",
            "-t", str(duration),
            "-pix_fmt", "yuv420p",
            "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0d1117",
            "-r", "30",
            "-preset", "fast",
            str(seg_path),
        ], capture_output=True, timeout=30)
        print(f"  Segment {i:02d}: {filename} ({duration}s)")

    # Create concat file
    with open(CONCAT_FILE, "w") as f:
        for seg in segments:
            f.write(f"file '{seg}'\n")

    # Concatenate all segments
    print("\nConcatenating segments...")
    concat_output = DEMO_DIR / "demo-nosound.mp4"
    subprocess.run([
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", str(CONCAT_FILE),
        "-c", "copy",
        str(concat_output),
    ], capture_output=True, timeout=60)

    # Add audio
    print("Adding narration audio...")
    subprocess.run([
        "ffmpeg", "-y",
        "-i", str(concat_output),
        "-i", str(AUDIO_FILE),
        "-c:v", "copy",
        "-c:a", "aac",
        "-ar", "44100",
        "-b:a", "128k",
        "-shortest",
        str(OUTPUT_FILE),
    ], capture_output=True, timeout=60)

    # Verify
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration,size",
         "-show_entries", "stream=codec_name,width,height,sample_rate",
         "-of", "json", str(OUTPUT_FILE)],
        capture_output=True, text=True
    )
    import json
    info = json.loads(result.stdout)
    duration = float(info["format"]["duration"])
    size = int(info["format"]["size"]) / (1024 * 1024)

    print(f"\n=== DONE ===")
    print(f"Output: {OUTPUT_FILE}")
    print(f"Duration: {int(duration//60)}:{int(duration%60):02d}")
    print(f"Size: {size:.1f} MB")

    # Check audio sample rate
    for stream in info.get("streams", []):
        if stream.get("sample_rate"):
            print(f"Audio: {stream['sample_rate']} Hz")
        if stream.get("width"):
            print(f"Video: {stream['width']}x{stream['height']}")

    # Clean up segments
    for seg in segments:
        seg.unlink(missing_ok=True)
    concat_output.unlink(missing_ok=True)
    CONCAT_FILE.unlink(missing_ok=True)
    print("Temp files cleaned up")


if __name__ == "__main__":
    build_video()
