# FE Agent Directory

This is the search-first directory for Codex agents. Read this before broad `rg`
when the task touches the generator UI. The app is DOM-driven: `App.tsx`
mounts `src/template.html`, then `src/initDomApp.ts` binds behavior.

Use this file as a map from feature names, Vietnamese/English issue wording,
DOM IDs, keywords, and owning source files.

## Fast Entry Points

| User wording / keyword | Start here | Then check | Search anchors |
| --- | --- | --- | --- |
| landing, pricing, hero, login button, profile badge | `src/template.html`, `src/account.ts` | `src/styles.css` | `landing`, `pricing`, `landingLoginBtn`, `landingProfileBtn`, `data-checkout-tier`, `promoCodeInput` |
| account, auth, login, signup, logout, session, profile | `src/account.ts` | `src/template.html`, `../api/src/index.ts`, `../api/src/services/auth.ts` | `AccountState`, `authModal`, `authLoginForm`, `authSignupForm`, `profileForm`, `/api/me`, `/api/profile` |
| billing, Paddle checkout, customer portal, tier, quota | `src/account.ts` | `../api/src/services/paddle.ts`, `../api/src/services/entitlements.ts` | `startCheckout`, `openPaddleCheckout`, `/api/billing/checkout`, `/api/billing/customer-portal`, `quota` |
| Paddle payment link, default payment link, `_ptxn` | `src/account.ts` | `../api/src/services/paddle.ts`, `../api/src/index.ts` | `openPaddlePaymentLinkCheckout`, `paymentLinkTransactionId`, `/api/billing/paddle-client`, `/pay?_ptxn=` |
| export PDF/PNG/JPG, download, html2canvas, jsPDF | `src/exportCard.ts` | `src/account.ts`, `src/protection.ts`, `src/styles.css` | `exportCardImage`, `printBtn`, `pngBtn`, `jpgBtn`, `authorizeCardExport`, `html2canvas`, `jsPDF`, `exporting` |
| IUL form fields, client banner, cash value, death benefit | `src/render.ts`, `src/core.ts` | `src/events.ts`, `src/template.html`, `src/persistence.ts` | `faceAmount`, `monthlyPrem`, `premYears`, `rate`, `dragTune`, `cbName`, `cvRows`, `b3Amt`, `state.actualCSV` |
| Term Life, Trendsetter, term card, term premium | `src/render.ts`, `src/pdf.ts` | `src/template.html`, `src/events.ts`, `src/persistence.ts` | `renderTerm`, `cardOutTerm`, `termFaceAmount`, `termMonthlyPrem`, `termLength`, `t_cbFace`, `t_dbAmt`, `Trendsetter` |
| tab switch, IUL/Term visibility | `src/render.ts`, `src/template.html` | `src/styles.css`, `src/persistence.ts` | `setTab`, `data-tab`, `brandAccent`, `tab-iul`, `tab-term`, `iul-only`, `term-only`, `currentTab` |
| PDF upload, autofill, parser, illustration, tabular rows | `src/pdf.ts` | `src/runtime.ts`, `src/core.ts`, `src/render.ts` | `parseFilename`, `extractPdfData`, `parsePdfText`, `applyExtracted`, `handlePdfUpload`, `TABULAR DETAIL`, `FFIUL`, `Trendsetter` |
| upload zone visual state | `src/pdf.ts`, `src/template.html` | `src/styles.css` | `uploadZone`, `pdfInput`, `uploadParsed`, `uploadSuccess`, `uploadError`, `uploadZoneTerm`, `pdfInputTerm` |
| living benefits, hide/show cards, columns, icons, bilingual text | `src/livingBenefitColumns.ts`, `src/livingBenefitFormat.ts` | `src/template.html`, `src/persistence.ts`, `src/styles.css` | `DEFAULT_BENEFITS`, `DEFAULT_LIVING_BENEFIT_COLUMNS`, `data-lb-action`, `lb-toggle`, `living-card`, `living-title`, `living-list` |
| header text, card title, logo upload | `src/headerEditor.ts` | `src/template.html`, `src/persistence.ts` | `setHeaderTitle`, `setHeaderLogo`, `captureHeaderState`, `iulHeaderTitleInput`, `termHeaderLogoInput`, `data-header-logo-trigger`, `ta-pill` |
| style editor, colors, fonts, zoom | `src/styleEditor.ts` | `src/template.html`, `src/styles.css`, `src/persistence.ts` | `SE_DEFAULTS`, `applyStyles`, `se_font`, `se_zoom`, `se_headerBg`, `se_gold`, `se_resetBtn`, `_se_style` |
| autosave, localStorage, restore, hidden cards | `src/persistence.ts` | `src/initDomApp.ts`, editor modules | `STORAGE_KEY`, `saveState`, `loadState`, `scheduleSave`, `editableTerm`, `hiddenCards`, `styleSettings` |
| manual save button | `src/manualSave.ts` | `src/template.html`, `src/persistence.ts` | `saveBtn`, `bindManualSaveButton` |
| custom dropdowns/select UI | `src/customDropdown.ts` | `src/events.ts`, `src/pdf.ts`, `src/styleEditor.ts` | `bindCustomDropdowns`, `refreshCustomDropdowns`, `custom-select`, `gender`, `riskClass`, `termLength` |
| Material icon placeholders | `src/muiIcons.ts` | `src/template.html` | `hydrateMuiIcons`, `data-mui-icon`, `PictureAsPdf`, `CloudUpload`, `Palette`, `Image` |
| print/context-menu/watermark protection | `src/protection.ts` | `src/exportCard.ts`, `src/styles.css` | `installContentProtection`, `MANLE.INFO`, `blockPrint`, `contextmenu`, `watermark` |

## Bootstrap Order

`src/main.tsx` renders `App`.

`src/App.tsx` injects `template.html` with `dangerouslySetInnerHTML`.

`src/initDomApp.ts` owns one-time boot. Current order:

1. Wire save schedulers into render/style/living/header modules.
2. Capture living benefit baselines.
3. `loadState()`.
4. `bindCustomDropdowns()`.
5. `syncLivingBenefitColumnUI()`.
6. `repairAllLivingBenefitFormats()`.
7. `renderAgeList()` and `renderAgentList()`.
8. `bindAll()` for core controls and export buttons.
9. `bindLandingNavigation()`.
10. `bindAccountAndBilling()`.
11. `bindStyleEditor()`.
12. `hydrateMuiIcons()`.
13. Initialize living-benefit toggle button labels.
14. `bindUploadZone()`.
15. `cloneLogos()`.
16. `bindHeaderEditor()`.
17. `setTab(state.currentTab)`.
18. `render()`.
19. `syncLivingBenefitColumnUI()`.
20. `installContentProtection()`.
21. Bind card contenteditable autosave.
22. Bind `beforeunload`, living benefit format guards, manual save.

Do not reorder this casually. Most "state did not restore", "editor lost value",
"dropdown stale", and "Term card flashes old data" issues start here.

## State And Field Ownership

`src/core.ts` owns shared state:

- `state.currentTab`: `iul` or `term`.
- `state.ages`: projected cash-value target ages.
- `state.actualCSV`, `state.actualPVMap`, `state.actualDBMap`: PDF-derived IUL tabular overrides.
- `state.agents`: shared footer agent list for both cards.
- `state.livingBenefitColumns`: per-product living benefit column/card IDs.

Currency inputs must be added to `CURRENCY_FIELD_IDS`:

- `faceAmount`
- `monthlyPrem`
- `termFaceAmount`
- `termMonthlyPrem`

Shared client/risk fields:

- `firstName`, `lastName`, `age`, `gender`, `state`, `riskClass`

IUL-specific policy fields:

- `faceAmount`, `monthlyPrem`, `premYears`, `rate`, `dragTune`

Term-specific policy fields:

- `termFaceAmount`, `termMonthlyPrem`, `termLength`

Agent/footer fields:

- `agentFirm`, `agentList`, `addAgentBtn`, `ftAgentList`, `t_ftAgentList`

## Template DOM Map

Core page sections:

- Landing/pricing: `landing`, `pricing`, `card-generator`
- Profile: `profile`
- Auth modal: `authModal`
- Generator layout: `cardOut`, `cardOutTerm`

Account/profile/auth IDs:

- Landing buttons: `landingLoginBtn`, `landingProfileBtn`, `landingLogoutBtn`
- Landing profile display: `landingProfileInitials`, `landingProfileName`, `landingProfileTier`
- Sidebar entitlement: `accountPanel`, `accountTier`, `accountQuota`, `accountEntitlementNote`
- Profile page: `profileInitials`, `profileTitle`, `profileSubtitle`, `profileTier`, `profileQuota`, `profileStatus`, `profileHelp`, `profileMessage`
- Profile form: `profileForm`, `profileNameInput`, `profileEmailInput`, `profileCurrentPasswordInput`, `profileNewPasswordInput`, `profileConfirmPasswordInput`, `profileSaveBtn`, `profileLoginBtn`, `profileSignupBtn`
- Auth forms: `authTitle`, `authCloseBtn`, `authLoginForm`, `authSignupForm`, `data-auth-mode="login"`, `data-auth-mode="signup"`

Pricing/billing IDs and attributes:

- `promoCodeInput`
- `data-checkout-tier="free" | "basic" | "plus" | "pro"`

Product/tab IDs and attributes:

- `brandAccent`
- `.tab-btn[data-tab="iul"]`
- `.tab-btn[data-tab="term"]`
- Body classes: `tab-iul`, `tab-term`
- Visibility classes: `.iul-only`, `.term-only`

Upload IDs:

- IUL: `uploadZone`, `pdfInput`, `uploadDefault`, `uploadDefaultLabel`, `uploadParsed`, `uploadFileName`, `uploadSuccess`, `uploadError`
- Term: `uploadZoneTerm`, `pdfInputTerm`, `uploadDefaultTerm`, `uploadParsedTerm`, `uploadFileNameTerm`, `uploadSuccessTerm`, `uploadErrorTerm`

Header/logo editor IDs:

- IUL: `iulHeaderTitleInput`, `iulHeaderLogoInput`, `iulHeaderLogoEditorPreview`, `data-header-logo-trigger="iul"`
- Term: `termHeaderTitleInput`, `termHeaderLogoInput`, `termHeaderLogoEditorPreview`, `data-header-logo-trigger="term"`
- Hidden preview inputs are created dynamically by `headerEditor.ts`: `iulHeaderLogoPreviewInput`, `termHeaderLogoPreviewInput`

IUL rendered-card IDs:

- Banner: `cbName`, `cbAgeGender`, `cbState`, `cbRisk`, `cbFace`, `cbPrem`, `cbPayYears`
- Living cards: `iul_lc_chronic`, `iul_lc_terminal`, `iul_lc_critical`
- Benefit/death/cash value: `b3Amt`, `b3State`, `cvRate`, `cvRows`, `cvAddBtn`
- Footer: `ftAgentList`, `ftDisc`, `ftClient`, `ftDate`

Term rendered-card IDs:

- Banner: `t_cbName`, `t_cbAgeGender`, `t_cbState`, `t_cbRisk`, `t_cbFace`, `t_cbPrem`, `t_cbTerm`
- Death benefit body: `t_dbAmt`, `t_termYears`, `t_termYearsVi`, `t_dbState`
- Living cards: `t_lc_chronic`, `t_lc_terminal`, `t_lc_critical`
- Footer: `t_ftAgentList`, `t_ftDisc`, `t_ftClient`, `t_ftDate`

Living benefit editor IDs/classes:

- IUL editor root: `iulLbColumnEditor`, section `data-lb-product="iul"`
- Term editor root: `termLbColumnEditor`, section `data-lb-product="term"`
- Actions: `data-lb-action="add-column"`, `data-lb-action="reset-columns"`
- Runtime classes: `.lb-toggle-section`, `.lb-column-grid`, `.lb-toggle-btn`, `.lb-hidden`, `.living-card`, `.living-title`, `.living-list`

Style editor IDs:

- Root/toggle: `styleEditor`, `styleEditorToggle`
- Font/zoom: `se_font`, `se_zoom`, `se_zoom_val`
- Header/banner: `se_headerBg`, `se_titleColor`, `se_bannerBg`, `se_bannerLabel`, `se_gold`
- Badge/benefit colors: `se_badgeL`, `se_badgeR`, `se_teal`, `se_lcBg`, `se_lcBorder`, `se_iconBg`, `se_iconColor`, `se_lcTitle`, `se_lcSubtitle`
- Footer: `se_footerBg`, `se_agentColor`
- Each color has a matching `_hex` input.
- Reset: `se_resetBtn`

Action buttons:

- Save: `saveBtn`
- Export PDF: `printBtn`
- Export PNG: `pngBtn`
- Export JPG: `jpgBtn`
- New client: `newClientBtn`
- Full reset: `resetBtn`

## API Contract Touchpoints

Frontend uses `VITE_API_BASE_URL` or `http://127.0.0.1:8787`.

`src/account.ts` is the only frontend owner for account/billing API calls:

- `GET /api/me`
- `GET /api/entitlements`
- `PATCH /api/profile`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/oauth/google/start`
- `GET /api/auth/oauth/apple/start`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/exports/authorize`
- `POST /api/billing/checkout`
- `GET /api/billing/paddle-client`
- `POST /api/billing/customer-portal`

If account shape changes, update:

- `src/account.ts` `AccountState`
- `src/template.html` account/profile DOM
- `src/styles.css` account/profile styles if display changes
- `../api/src/services/entitlements.ts` response shape
- `../api/src/index.ts` route if endpoint contract changes

Account state includes billing link status:

- `billing.hasPaddleCustomer`: controls whether the profile Billing button opens Paddle Customer Portal or sends the user to pricing checkout.

## PDF Parser Directory

`src/pdf.ts` owns all PDF autofill behavior.

Filename parser anchors:

- `parseFilename`
- Name from first non-number/non-risk token.
- Face amount formats: `$500,000`, `500K`, `1.5M`, `FA 500K`.
- Monthly premium formats: `$300`, `300mo`, `300/mo`, `monthly`.
- Pay years: `20Y`, `20 Years`.
- Risk: `Preferred Elite`, `Preferred Plus`, `Preferred`, `Standard Plus`, `Standard`.

Content parser anchors:

- `extractPdfData`
- `parsePdfText`
- `Designed For`
- `Input Summary`
- `First Name`, `Last Name`
- `Issue Age or D.O.B.`
- `Gender`
- `Issue State`
- `Risk Class`
- `Initial Face Amount`
- `Initial Monthly Premium`
- `Planned Periodic Premiums`
- `Death Benefit Option`

Product detection:

- Term: `Trendsetter`, `Level Term Period`, `Guaranteed Level Term`
- IUL: `FFIUL`, `Indexed Universal Life`, `TABULAR DETAIL`, `Index Account`

IUL tabular rows:

- `TABULAR DETAIL` pages grouped by y-coordinate.
- Last three numeric values are interpreted as policy value, cash surrender value, death benefit.
- Populates `state.actualPVMap`, `state.actualCSV`, `state.actualDBMap`.
- Sets `rate` to `7.25` when exact tabular rows are found.

Upload zones:

- `handlePdfUpload(file, 'iul')`
- `handlePdfUpload(file, 'term')`
- `applyExtracted(data, targetTab)`
- Term PDF switches tab to `term`; IUL PDF switches to `iul`.

## Persistence Directory

`src/persistence.ts` owns localStorage key `5ways_iul_v9_state`.

Saved payload sections:

- `currentTab`
- `form`: all shared/IUL/Term input values
- `agents`
- `ages`
- `header`
- `livingBenefitColumns`
- `editable`: IUL editable HTML
- `editableTerm`: Term editable HTML
- `hiddenCards`
- `styleSettings`

If adding any user-facing persistent control, update both `saveState()` and
`loadState()`. If the control affects dropdown display, call
`refreshCustomDropdowns()` after programmatic changes.

## CSS Directory

`src/styles.css` owns all visual state. Search by class or DOM ID.

Important class groups:

- Landing/pricing: `.landing-page`, `.landing-nav`, `.landing-hero`, `.pricing-section`, `.price-card`
- Account/profile/auth: `.account-panel`, `.profile-page`, `.profile-form`, `.auth-modal`, `.auth-dialog`
- Layout/sidebar: `.layout`, `.form-pane`, `.preview-wrap`, `.tab-switcher`, `.tab-btn`
- Upload: `.upload-section`, `.upload-zone`, `.upload-success`, `.upload-error`, `.parsed`, `.parsing`, `.dragover`
- Card: `.card`, `.card-header`, `.card-title`, `.client-banner`, `.benefit-badge`, `.benefit3-box`, `.living-grid`, `.living-card`, `.card-footer`
- Term/IUL visibility: `.iul-only`, `.term-only`, `body.tab-iul`, `body.tab-term`
- Living editor: `.lb-toggle-section`, `.lb-column-grid`, `.lb-toggle-btn`, `.lb-hidden`
- Style editor: `.style-editor`, `.se-section`, `.se-color`, `.se-hex`, `.se-range`
- Export controls: `.export-row`, `.exporting`

## Search Recipes

Start narrow:

```bash
rg -n "keyword|domId|functionName" fe/src --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/.vite/**'
```

Find all template IDs:

```bash
rg -n -o 'id="[^"]+"|data-[a-zA-Z0-9_-]+="[^"]+"' fe/src/template.html
```

Find DOM ID usage:

```bash
rg -n "\\$\\('domId'\\)|byId\\('domId'\\)|getElementById\\('domId'\\)" fe/src
```

Find account API calls:

```bash
rg -n "/api/|apiFetch|authorizeCardExport|checkout|portal|profile" fe/src/account.ts
```

Find parser issues:

```bash
rg -n "parseFilename|parsePdfText|TABULAR DETAIL|Trendsetter|FFIUL|Initial Monthly Premium|Risk Class" fe/src/pdf.ts
```

Find export/visual capture issues:

```bash
rg -n "exportCardImage|html2canvas|jsPDF|exporting|authorizeCardExport|watermark" fe/src
```

## Agent Rules For FE Changes

- Treat `template.html` IDs/classes as contract.
- Shared client/risk/agent/header/style/footer changes must update IUL and Term behavior together.
- Product-specific policy fields stay separate: IUL uses `faceAmount/monthlyPrem/premYears/rate`; Term uses `termFaceAmount/termMonthlyPrem/termLength`.
- Do not invent insurance values. Parser fallbacks must stay conservative.
- Preserve bilingual English/Vietnamese card text unless the task explicitly changes copy.
- Run `cd fe && bun run build` after any source/template/style change.
