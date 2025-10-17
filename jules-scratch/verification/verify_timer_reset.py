import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    # Path to the extension directory
    extension_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

    async with async_playwright() as p:
        browser_context = await p.chromium.launch_persistent_context(
            '',
            headless=True,
            args=[
                f'--disable-extensions-except={extension_path}',
                f'--load-extension={extension_path}',
            ]
        )

        # 1. Open a new tab, which should activate the extension's logic
        page1 = await browser_context.new_page()
        await page1.goto('https://www.google.com')

        # 2. Open a second tab, which should become the active tab
        page2 = await browser_context.new_page()
        await page2.goto('https://www.bing.com')

        # 3. Print initial tab order
        tabs = browser_context.pages
        titles = [await page.title() for page in tabs]
        print(f"Initial tab titles: {titles}")

        # 4. Wait for the reorder delay (default is 5 seconds)
        await asyncio.sleep(6)

        # 5. Take a screenshot to verify the result
        await page2.screenshot(path="jules-scratch/verification/verification.png")

        # 6. Print final tab order
        tabs = browser_context.pages
        titles = [await page.title() for page in tabs]
        print(f"Final tab titles: {titles}")

        await browser_context.close()

if __name__ == '__main__':
    asyncio.run(main())