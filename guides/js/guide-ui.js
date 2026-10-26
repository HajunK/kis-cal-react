// The controls every study guide page gets, in one script: the glass zoom control
// and the back arrow to KIS Cal (top corners), the star rating (or the sign in pill
// at the bottom), the "Made by Hajun Kim" footer, and the count of who has read the guide. Their look is in guides.css. A page, whether
// guide.html (every guide made in the editor) or a page of its own like /biology,
// needs only this one tag, after the stylesheet:
//   <link rel="stylesheet" href="/guides.css" />
//   <script type="module" src="/js/guide-ui.js"></script>
import "./zoom.js";
import "./app-link.js";
import "./footer.js";
import "./views.js";
