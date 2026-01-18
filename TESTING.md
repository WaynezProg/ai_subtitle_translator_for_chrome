# AI Subtitle Translator - Manual Testing Guide

## Prerequisites

1. **Build the extension**
   ```bash
   npm run build
   ```

2. **Load extension in Chrome**
   - Open `chrome://extensions`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist/` folder from this project

3. **Configure a provider** (Options page)
   - Click the extension icon → "Settings"
   - Choose one of:
     - **Claude API**: Enter your Anthropic API key
     - **OpenAI API**: Enter your OpenAI API key
     - **Ollama**: Ensure Ollama is running locally (`ollama serve`)

---

## Test Cases

### T142: YouTube E2E Test

**Objective**: Verify subtitle translation works on YouTube

#### Steps

1. **Navigate to YouTube video with subtitles**
   - Recommended: [TED Talk with subtitles](https://www.youtube.com/watch?v=8S0FDjFBj8o)
   - Or any video with CC/subtitles available

2. **Enable original subtitles**
   - Click CC button on YouTube player
   - Select a non-Chinese language (e.g., English)

3. **Look for translate button**
   - [ ] Translate button appears in player controls (near CC button)
   - [ ] Button shows correct initial state (idle or cached)

4. **Click translate button**
   - [ ] Progress overlay appears
   - [ ] Progress percentage updates
   - [ ] No JavaScript errors in console (F12 → Console)

5. **Verify translation**
   - [ ] Translated subtitles appear on video
   - [ ] Subtitles are in Traditional Chinese
   - [ ] Timing matches original subtitles
   - [ ] Original subtitle is hidden or replaced

6. **Test subtitle toggle**
   - Click extension popup icon
   - Toggle "Show Subtitles" off
   - [ ] Translated subtitles disappear
   - Toggle "Show Subtitles" on
   - [ ] Translated subtitles reappear

7. **Test navigation**
   - Navigate to another YouTube video
   - [ ] Extension resets properly
   - [ ] Translate button appears for new video

#### Expected Results
- Translation completes without errors
- Subtitles display correctly over video
- Button state updates appropriately

---

### T143: Netflix E2E Test

**Objective**: Verify subtitle translation works on Netflix

#### Prerequisites
- Active Netflix subscription
- Logged into Netflix in Chrome

#### Steps

1. **Navigate to Netflix content**
   - Choose a movie or TV show with subtitles
   - Recommended: Content with English audio/subtitles

2. **Enable original subtitles**
   - Click subtitle/audio settings in Netflix player
   - Select a non-Chinese subtitle track

3. **Look for translate button**
   - [ ] Translate button appears in Netflix player
   - [ ] Extension detects Netflix platform

4. **Click translate button**
   - [ ] Progress overlay appears
   - [ ] Translation starts processing
   - [ ] Console shows `[NetflixAdapter]` logs

5. **Verify translation**
   - [ ] Translated subtitles appear
   - [ ] Subtitles are in Traditional Chinese
   - [ ] Timing is correct

6. **Test playback controls**
   - Pause/resume video
   - [ ] Subtitles continue to display correctly
   - Seek forward/backward
   - [ ] Subtitles update for new position

#### Expected Results
- Netflix TTML subtitles are intercepted
- Translation displays correctly
- No interference with Netflix player

---

### T144: Cache Persistence Test

**Objective**: Verify translations persist across browser restart

#### Steps

1. **Perform initial translation**
   - Go to a YouTube video with subtitles
   - Click translate button
   - Wait for translation to complete
   - [ ] Note the video URL/ID

2. **Verify cache status**
   - Open Options page → Cache Management
   - [ ] Cache shows entries > 0
   - [ ] Size shows > 0 bytes

3. **Close Chrome completely**
   - Quit Chrome (Cmd+Q on Mac, Alt+F4 on Windows)
   - Wait 5 seconds

4. **Reopen Chrome**
   - Open Chrome
   - Navigate to the same YouTube video

5. **Verify cache hit**
   - [ ] Translate button shows "cached" state (different icon/color)
   - Click translate button
   - [ ] Translation appears instantly (no progress bar)
   - [ ] Console shows cache hit message

6. **Verify cache management**
   - Open Options page → Cache Management
   - [ ] Same number of entries as before restart
   - Click "Clear Cache"
   - [ ] Cache entries reset to 0
   - Return to video
   - [ ] Translate button shows "idle" state (not cached)

#### Expected Results
- IndexedDB cache survives browser restart
- Cached translations load instantly
- Cache can be cleared from options

---

## Platform-Specific Tests (Optional)

### Disney+ Test

1. Navigate to Disney+ content
2. Enable subtitles
3. [ ] Translate button appears
4. [ ] Translation works correctly

### Prime Video Test

1. Navigate to Prime Video content
2. Enable subtitles
3. [ ] Translate button appears
4. [ ] Translation works correctly

---

## Error Handling Tests

### Network Error Test

1. Disconnect from internet
2. Click translate button
3. [ ] Appropriate error message displays
4. [ ] "Retry" button appears
5. Reconnect to internet
6. Click retry
7. [ ] Translation resumes

### Invalid API Key Test

1. Enter invalid API key in options
2. Click translate button
3. [ ] Error message indicates authentication failure
4. [ ] No crash or infinite loading

### Cancel Translation Test

1. Start a translation (long video recommended)
2. Click "Cancel" during progress
3. [ ] Translation stops
4. [ ] Partial results are discarded
5. [ ] Button returns to idle state

---

## Console Debugging

Open DevTools (F12) and filter console by:
- `[Content]` - Content script logs
- `[Background]` - Service worker logs
- `[YouTubeAdapter]` - YouTube-specific logs
- `[NetflixAdapter]` - Netflix-specific logs
- `[Bridge]` - Message bridge logs
- `[Cache]` - Cache operations

### Expected Console Flow (YouTube)

```
[Content] AI Subtitle Translator content script loaded
[Content] Platform detected: youtube
[YouTubeAdapter] Initialized
[Content] Subtitle detected: https://www.youtube.com/api/timedtext...
[Content] Starting translation...
[Background] Translation job started: job_xxx
[Background] Translating chunk 1/5...
[Background] Chunk 1 complete
...
[Background] Translation complete
[Content] Translation complete, rendering subtitles
[Cache] Stored translation for video_xxx
```

---

## Test Result Template

Copy and fill in:

```markdown
## Test Results - [Date]

### Environment
- Chrome Version: 
- OS: 
- Provider Used: 

### T142: YouTube
- [ ] Pass / [ ] Fail
- Notes: 

### T143: Netflix
- [ ] Pass / [ ] Fail
- Notes: 

### T144: Cache Persistence
- [ ] Pass / [ ] Fail
- Notes: 

### Issues Found
1. 
2. 

### Screenshots
(Attach if needed)
```

---

## Troubleshooting

### Extension not loading
- Check `chrome://extensions` for errors
- Verify `dist/` folder exists and contains `manifest.json`

### Translate button not appearing
- Check console for errors
- Verify subtitles are enabled on the video
- Try refreshing the page

### Translation fails immediately
- Check API key configuration in options
- Verify network connectivity
- Check console for specific error messages

### Subtitles not displaying
- Check if original subtitles are visible
- Verify subtitle toggle is enabled in popup
- Check console for rendering errors
