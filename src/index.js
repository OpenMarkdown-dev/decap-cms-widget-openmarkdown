// Bundler entry (decap-cms-app + React). Usage:
//   import CMS from "decap-cms-app";
//   import { registerOpenMarkdownWidget } from "decap-cms-widget-openmarkdown";
//   registerOpenMarkdownWidget(CMS);
import createClass from "create-react-class";
import { createElement as h } from "react";
import {
  createOpenMarkdownControl,
  createOpenMarkdownPreview,
  registerOpenMarkdownWidget as register,
  WIDGET_NAME,
} from "./control.js";

const react = { createClass, h };

export const OpenMarkdownControl = createOpenMarkdownControl(react);
export const OpenMarkdownPreview = createOpenMarkdownPreview(react);
export { WIDGET_NAME, createOpenMarkdownControl, createOpenMarkdownPreview };

export function registerOpenMarkdownWidget(CMS, name = WIDGET_NAME) {
  CMS.registerWidget(name, OpenMarkdownControl, OpenMarkdownPreview);
}
