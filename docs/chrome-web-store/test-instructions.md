# Chrome Web Store review test instructions

Use this text in the Test instructions tab.

## Test account

The extension is designed for Synergy LMS and requires access to a Synergy LMS student account with learning materials. If a reviewer needs credentials, provide a temporary test account separately in the Chrome Web Store dashboard.

## How to test

1. Install the extension package.
2. Open a supported Synergy LMS page under `https://*.synergy.ru/*`.
3. Open the extension sidebar.
4. Confirm that the extension detects the LMS page.
5. Click the route refresh/generation action and verify that a weekly route appears.
6. Open a learning material page and upload a lecture PDF inside the extension.
7. Test AI tutoring features: chat question, mini-summary, glossary and practice task.
8. Open a final test or assessment page and verify that AI tutoring features are blocked.

## Expected behavior

The extension reads LMS context only from supported Synergy LMS pages. It does not modify LMS data, submit answers, or automate tests.

