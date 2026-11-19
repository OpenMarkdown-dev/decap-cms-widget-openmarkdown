// <script type="module"> entry for Decap's script-tag build (decap-cms.js).
// Decap's bundle exposes window.CMS, window.createClass and window.h; it does
// not expose React, so we use those. Load this after decap-cms.js.
import { registerOpenMarkdownWidget } from "./control.js";

const { CMS, createClass, h } = window;
if (!CMS || !createClass || !h) {
  throw new Error("decap-cms-widget-openmarkdown: load decap-cms.js before this script");
}
registerOpenMarkdownWidget(CMS, { createClass, h });
