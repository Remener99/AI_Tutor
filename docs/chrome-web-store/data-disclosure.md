# Chrome Web Store privacy disclosures

Use this text when filling out the Privacy tab in Chrome Web Store Developer Dashboard.

## Single purpose

Семпейс AI helps students study in Synergy LMS by reading visible LMS learning context, generating a weekly study route, and providing AI tutoring for user-uploaded learning materials.

## Permission justification

### `storage`

Used to store extension settings and temporary learning state locally in Chrome.

### `activeTab`

Used to interact with the currently opened supported LMS page after the user opens the extension.

### `scripting`

Used to inject the extension sidebar/content script into supported Synergy LMS pages.

### Host permission: `https://*.synergy.ru/*`

Used to read visible study context from Synergy LMS pages, including discipline names, topic names, progress and page type.

### Host permission: backend URL

Used to send user-initiated AI requests to the Семпейс AI backend.

## Data types to disclose

Recommended disclosure categories:

- Website content: yes. The extension reads visible LMS page content required to build the learning route.
- User activity: yes. The extension reads course/topic progress and completion status from LMS pages.
- Authentication information: no.
- Personally identifiable information: no, unless the LMS page visibly includes identifying profile data. The extension should not request or use personal identity data for its core function.
- Financial and payment information: no.
- Health information: no.
- Personal communications: no.
- Location: no.
- Web history: no. The extension is limited to supported Synergy LMS pages.

## Data use certification

Recommended statements:

- Data is used only for the extension's single purpose.
- Data is not sold.
- Data is not used or transferred for unrelated advertising.
- Data is not used for creditworthiness or lending.
- Data is transmitted only when needed to provide user-requested AI features.

## Remote code

Select: No, the extension does not execute remote code.

Reasoning: The extension sends API requests to the backend AI service, but it does not download or execute remote JavaScript code.
