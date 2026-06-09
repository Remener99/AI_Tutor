# Chrome Web Store developer account checklist

Google requires the extension ZIP to be uploaded through the Chrome Web Store Developer Dashboard.

## Steps

1. Open the Chrome Web Store Developer Dashboard:
   https://chrome.google.com/webstore/devconsole
2. Sign in with the Google account that will own the product.
3. Register as a developer and pay the one-time registration fee if the account is not registered yet.
4. Complete developer profile information.
5. Add privacy policy URL in the developer account settings.
6. Click **Add new item**.
7. Upload the production ZIP package from:
   `apps/extension/build/chrome-mv3-prod.zip`
8. Fill in Store Listing using:
   `docs/chrome-web-store/listing.md`
9. Fill in Privacy using:
   `docs/chrome-web-store/data-disclosure.md`
10. Add screenshots and the small promotional image from:
    `docs/chrome-web-store/assets/`
11. Fill in Test instructions using:
    `docs/chrome-web-store/test-instructions.md`
12. Choose distribution settings.
13. Submit for review.

## Before public launch

For a university pilot, prefer publishing as **Unlisted** first. This keeps the item installable by link while avoiding broad public discovery before the pilot is approved.

