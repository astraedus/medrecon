#!/usr/bin/env python3
"""
Record MedRecon demo video by capturing screenshots at key moments.

Captures the frontend at each step of the demo flow, then stitches
them together with narration audio into a final video.

Uses Patchright (undetected Playwright fork) for browser automation.
"""
import time
from pathlib import Path
from patchright.sync_api import sync_playwright

DEMO_URL = "https://frontend-eta-flax-63.vercel.app"
SCREENSHOT_DIR = Path(__file__).parent / "screenshots"
SCREENSHOT_DIR.mkdir(exist_ok=True)

# Demo patient: Dorothy Mae Johnson
PATIENT_ID = "131494601"


def take_screenshot(page, name, delay=1):
    """Take a full-page screenshot with a delay for animations."""
    time.sleep(delay)
    path = SCREENSHOT_DIR / f"{name}.png"
    page.screenshot(path=str(path), full_page=False)
    print(f"  Screenshot: {name}.png")
    return path


def record_demo():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            channel="chrome",
        )
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1,
            color_scheme="dark",
        )
        page = context.new_page()

        # 1. INITIAL STATE - Dashboard loaded
        print("\n=== Recording MedRecon Demo ===\n")
        print("1. Loading dashboard...")
        page.goto(DEMO_URL, wait_until="networkidle", timeout=20000)
        time.sleep(2)
        take_screenshot(page, "01-dashboard-initial", delay=1)

        # 2. SELECT PATIENT - Click Dorothy Johnson
        print("2. Selecting Dorothy Johnson...")
        # Click Dorothy Johnson button
        dorothy_btn = page.locator("button", has_text="Dorothy Johnson")
        if dorothy_btn.count() > 0:
            dorothy_btn.click()
            take_screenshot(page, "02-patient-selected", delay=1)
        else:
            # Fallback: type the ID manually
            patient_input = page.locator("#patient-id")
            patient_input.fill(PATIENT_ID)
            take_screenshot(page, "02-patient-selected", delay=1)

        # 3. CLICK RECONCILE - Full Pipeline mode
        print("3. Starting reconciliation (Full Pipeline)...")
        reconcile_btn = page.locator("button", has_text="Reconcile")
        reconcile_btn.click()
        take_screenshot(page, "03-pipeline-collecting", delay=2)

        # 4. PIPELINE STEPS - Source Collector
        print("4. Source Collector running...")
        time.sleep(8)
        take_screenshot(page, "04-pipeline-analyzing", delay=0)

        # 5. PIPELINE STEPS - Interaction Checker
        print("5. Interaction Checker running...")
        time.sleep(12)
        take_screenshot(page, "05-pipeline-assembling", delay=0)

        # 6. PIPELINE STEPS - Assembling
        print("6. Assembling report...")
        time.sleep(15)
        take_screenshot(page, "06-pipeline-assembling-2", delay=0)

        # 7. REPORT COMPLETE - Wait for full completion
        print("7. Waiting for report...")
        # Wait up to 120s for the report to appear
        try:
            page.wait_for_selector("text=Reconciliation Report", timeout=120000)
            time.sleep(2)
        except:
            print("  (report timeout - taking screenshot anyway)")
        take_screenshot(page, "07-report-complete", delay=1)

        # 8. SCROLL THROUGH REPORT - Top section
        print("8. Scrolling report - patient info...")
        page.evaluate("window.scrollBy(0, 400)")
        take_screenshot(page, "08-report-patient-info", delay=1)

        # 9. REPORT - Safety analysis
        print("9. Scrolling report - safety analysis...")
        page.evaluate("window.scrollBy(0, 400)")
        take_screenshot(page, "09-report-safety", delay=1)

        # 10. REPORT - More safety details
        print("10. Scrolling report - interactions...")
        page.evaluate("window.scrollBy(0, 400)")
        take_screenshot(page, "10-report-interactions", delay=1)

        # 11. SWITCH TO QUICK SCAN
        print("11. Switching to Quick Scan mode...")
        page.evaluate("window.scrollTo(0, 0)")
        time.sleep(1)
        quick_scan_btn = page.locator("button", has_text="Quick Scan")
        if quick_scan_btn.count() > 0:
            quick_scan_btn.click()
            time.sleep(1)
            # Click Reconcile again
            reconcile_btn = page.locator("button", has_text="Reconcile")
            reconcile_btn.click()
            # Wait for results
            try:
                page.wait_for_selector("text=Patient Medications", timeout=30000)
                time.sleep(2)
            except:
                time.sleep(10)
            take_screenshot(page, "11-quickscan-results", delay=1)

            # Scroll to see interactions
            page.evaluate("window.scrollBy(0, 400)")
            take_screenshot(page, "12-quickscan-interactions", delay=1)

        # 12. FHIR BUNDLE - Generate and show
        print("12. Generating FHIR Bundle...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(1)
        fhir_btn = page.locator("button", has_text="Generate FHIR Bundle")
        if fhir_btn.count() > 0:
            fhir_btn.click()
            time.sleep(5)
            take_screenshot(page, "13-fhir-bundle", delay=1)

        # 13. FINAL - Scroll back to top for closing shot
        print("13. Final shot...")
        page.evaluate("window.scrollTo(0, 0)")
        take_screenshot(page, "14-final", delay=2)

        browser.close()

    # List all screenshots
    print(f"\n=== Screenshots captured ===")
    for f in sorted(SCREENSHOT_DIR.glob("*.png")):
        print(f"  {f.name}")
    print(f"\nTotal: {len(list(SCREENSHOT_DIR.glob('*.png')))} screenshots")
    print(f"Location: {SCREENSHOT_DIR}")


if __name__ == "__main__":
    record_demo()
