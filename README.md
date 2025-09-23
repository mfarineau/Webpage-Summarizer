# Webpage Summarizer Extension

A simple Chrome extension that uses OpenAI to summarize the current page or selected text. The summary popup now includes a few images from the page and the popup provides utilities like ad removal, framework detection, domain info lookup and basic cookie management.

## Summary History

Every time a summary is generated the extension saves it locally with the page URL and timestamp. Click the **History** button in the popup to view your saved summaries. From the history page you can open the original page or delete individual entries.

## Save Pages

Press the **Save Page** button in the popup to store the full HTML of the current site for offline reading. Ads are removed automatically but all other content, including images, is preserved. Saved pages are listed in the history view where the full page is embedded for quick reference. You can delete any entry at any time.

## Manage Cookies

Use the **Manage Cookies** button in the popup to view common tracking cookies set by the current site. Pressing the button opens a small modal listing each tracking cookie along with a short description of its purpose. From the modal you can delete all of the listed cookies with a single click.

## Bias Analysis

Press the **Analyze Bias** button to check if a news article leans left, right or is neutral. The extension queries OpenAI for a short explanation and lists any indicators of bias. It now also researches the article's author, reviewing up to 25 recent pieces by that writer and reporting the author's overall political leaning when possible.

## Bypass JavaScript

Click the **Bypass** button to reload the current page with JavaScript disabled. This can help access content that normally requires scripts to run.

## Enable JavaScript

Use the **Enable JS** button to restore scripting. The page is reloaded with JavaScript allowed again.

## Export Site to PDF

Press the **Export PDF** button in the popup to generate a downloadable PDF of the current site. The crawler follows links to same-origin pages that share the current site's host, capturing each page's text exactly as it appears so the final document preserves the original wording. To keep exports manageable, the capture stops after the first 50 pages or when the site runs out of same-origin links.

When you trigger an export, Chrome will prompt you to grant the extension the **Downloads** permission so it can save the generated PDF to your device. Granting this permission is required for the export to complete successfully.

While the export runs, the popup shows a progress counter that updates as each page is fetched and rendered. Large sites can take several minutes to finish, so let the process continue until the completion notification appears and the PDF downloads automatically.
