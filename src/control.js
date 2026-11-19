// Decap CMS control + preview built on @openmarkdown-dev/editor.
//
// Decap hands a widget control `value` (the Markdown string), `onChange`,
// `forID`, `classNameWrapper`, `setActiveStyle` / `setInactiveStyle`,
// `isDisabled`, `getAsset` and `field`. It attaches a `ref` and later calls
// `focus()` / `shouldComponentUpdate()` on the instance, so the control must
// be a class component. Decap's script build exposes `createClass` and `h`
// (React.createElement) on window, but not React itself, so the control is a
// create-react-class spec: the same code works from a <script> tag and from a
// bundler (pass `create-react-class` and `React.createElement`).

import { languages } from "@codemirror/language-data";
import { createEditorState, mountEditor } from "@openmarkdown-dev/editor";

const STYLE_ID = "decap-openmarkdown-style";

// Everything is styled on .ome-root (the editor's public styling hook), which
// never matches the small editor a table cell opens while it is edited
// (.ome-nested). The tokens are the package's "Fit the host page" recipe, so
// the field takes Decap's font and size; height: "auto" (below) makes it grow
// with its content, so no .cm-scroller override is needed.
const CSS = `
.decap-openmarkdown { padding: 0 !important; overflow: hidden; }
.decap-openmarkdown .ome-root {
  min-height: 320px;
  --ome-bg: #fff;
  --ome-fg: inherit;
  --ome-font: inherit;
  --ome-font-size: 15px;
  --ome-content-width: 100%;
  --ome-padding-x: 1.5rem;
  --ome-padding-y: 1rem;
  --ome-accent: #3a69c7;
}
.decap-openmarkdown-preview .ome-root { --ome-content-width: 100%; }
`;

function injectStyle(doc) {
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const el = doc.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  doc.head.appendChild(el);
}

/** Map a Markdown image src to something the page can load, via Decap's media layer. */
// Images pasted in this session are not on the server until the entry is
// published, so they are shown from the pasted bytes: public path -> blob URL.
const pasted = new Map();

function makeResolveImage(getProps) {
  return (src) => {
    if (pasted.has(src)) return pasted.get(src);
    const { getAsset, field } = getProps();
    if (!getAsset || !src) return null;
    if (/^https:\/\//i.test(src)) return src;
    try {
      const asset = getAsset(src, field);
      const url = asset && (asset.url || asset.toString());
      return url && url !== "[object Object]" ? url : null;
    } catch {
      return null;
    }
  };
}

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" };

/**
 * Pasted / dropped images go through Decap's own media pipeline
 * (onPersistMedia, the same call the image widget makes): the file is held
 * as a draft asset and committed with the entry. Resolves the public path
 * to link, e.g. /img/pasted-1700000000000.png.
 */
function makeUploadImage(getProps) {
  return async (bytes, hint) => {
    const { onPersistMedia, field, config } = getProps();
    if (!onPersistMedia) return null;
    const isMime = !!hint && hint.includes("/") && !hint.includes(".");
    const ext = !isMime && hint ? hint.split(".").pop().toLowerCase() : "";
    const type = isMime ? hint : Object.keys(EXT).find((t) => EXT[t] === ext || (ext === "jpeg" && t === "image/jpeg")) || "";
    const name = !hint || isMime ? `pasted-${Date.now()}.${EXT[hint] || "png"}` : hint;
    const file = new File([bytes], name, { type });
    const result = await onPersistMedia(file, { field });
    const saved = result && result.payload && result.payload.file;
    if (!saved || !saved.name) return null;
    // Decap 3 passes `config` as a plain object (older versions: Immutable).
    const publicFolder = (config && (config.get ? config.get("public_folder") : config.public_folder)) || "";
    const link = `${publicFolder.replace(/\/$/, "")}/${saved.name}`;
    pasted.set(link, URL.createObjectURL(file));
    return link;
  };
}

export function createOpenMarkdownControl({ createClass, h }) {
  return createClass({
    displayName: "OpenMarkdownControl",

    componentDidMount() {
      injectStyle(this.el.ownerDocument);
      this.sent = [];
      const props = () => this.props;
      const label = this.props.field && this.props.field.get && this.props.field.get("label");
      const state = createEditorState({
        doc: this.props.value ?? "",
        height: "auto",
        editable: !this.props.isDisabled,
        id: this.props.forID, // Decap's <label for> now focuses the editor
        ariaLabel: label || undefined,
        codeLanguages: languages,
        host: {
          // Only user edits go up. setDoc() (value pushed in from Decap) is
          // not a user edit, so it is never echoed back as a change.
          onChange: (doc, isUserEdit) => {
            if (!isUserEdit) return;
            // Remember what we sent, so a late echo of an older value is not
            // pushed back in over newer typing (see componentDidUpdate).
            this.sent.push(doc);
            if (this.sent.length > 32) this.sent.shift();
            this.props.onChange(doc);
          },
          resolveImage: (this.resolveImage = makeResolveImage(props)),
          uploadImage: makeUploadImage(props),
        },
      });
      this.editor = mountEditor(this.el, state);
      this.el.openMarkdownEditor = this.editor; // handles for tests / devtools
      this.el.openMarkdownResolveImage = this.resolveImage;

      // Decap's active / inactive label colours follow focus anywhere in the
      // field, including a table cell's own editor.
      this.onFocusIn = () => this.props.setActiveStyle?.();
      this.onFocusOut = (e) => {
        if (!this.el.contains(e.relatedTarget)) this.props.setInactiveStyle?.();
      };
      this.el.addEventListener("focusin", this.onFocusIn);
      this.el.addEventListener("focusout", this.onFocusOut);
    },

    shouldComponentUpdate(next) {
      // Decap's Widget asks the control. Re-render only for the wrapper class
      // or the disabled flag; value changes are applied in componentDidUpdate,
      // which we still need, so a value change also returns true.
      return (
        next.value !== this.props.value ||
        next.classNameWrapper !== this.props.classNameWrapper ||
        next.hasActiveStyle !== this.props.hasActiveStyle ||
        next.isDisabled !== this.props.isDisabled
      );
    },

    componentDidUpdate(prev) {
      if (!this.editor) return;
      const value = this.props.value ?? "";
      // Value changed from outside (another widget, i18n duplicate, entry
      // reload): push it in. setDoc replaces only the differing part, so
      // the caret and scroll stay where they were.
      const current = this.editor.getDoc();
      if (value !== current) {
        const i = this.sent.lastIndexOf(value);
        if (i === -1) this.editor.setDoc(value);
        else this.sent.splice(0, i + 1); // stale echo of our own edit: ignore
      } else {
        this.sent.length = 0;
      }
      if (prev.isDisabled !== this.props.isDisabled) this.editor.setEditable(!this.props.isDisabled);
    },

    componentWillUnmount() {
      this.el?.removeEventListener("focusin", this.onFocusIn);
      this.el?.removeEventListener("focusout", this.onFocusOut);
      this.editor?.destroy();
      this.editor = null;
    },

    // Decap calls this for "jump to field" on validation errors.
    focus() {
      this.editor?.focus();
    },

    render() {
      const { classNameWrapper } = this.props;
      return h("div", {
        className: `${classNameWrapper || ""} decap-openmarkdown`,
        ref: (el) => {
          if (el) this.el = el;
        },
      });
    },
  });
}

/**
 * Preview: the same editor in read-only "reading" mode, so the preview draws
 * tables, footnotes and math the way the control does. Decap renders the
 * preview inside an iframe; the editor is mounted into the iframe's document.
 */
export function createOpenMarkdownPreview({ createClass, h }) {
  return createClass({
    displayName: "OpenMarkdownPreview",
    componentDidMount() {
      injectStyle(this.el.ownerDocument);
      this.editor = mountEditor(
        this.el,
        createEditorState({
          doc: this.props.value ?? "",
          mode: "reading",
          editable: false, // reading mode alone still lets a reader tick a task checkbox
          height: "auto",
          codeLanguages: languages,
          host: { resolveImage: makeResolveImage(() => this.props) },
        }),
      );
    },
    componentDidUpdate() {
      const value = this.props.value ?? "";
      if (this.editor && value !== this.editor.getDoc()) this.editor.setDoc(value);
    },
    componentWillUnmount() {
      this.editor?.destroy();
    },
    render() {
      return h("div", {
        className: "decap-openmarkdown-preview",
        ref: (el) => {
          if (el) this.el = el;
        },
      });
    },
  });
}

export const WIDGET_NAME = "openmarkdown";

/** Register both components on a Decap `CMS` object. */
export function registerOpenMarkdownWidget(CMS, react, name = WIDGET_NAME) {
  CMS.registerWidget(name, createOpenMarkdownControl(react), createOpenMarkdownPreview(react));
}
