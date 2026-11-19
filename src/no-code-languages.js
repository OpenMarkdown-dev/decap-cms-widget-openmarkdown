// Stand-in for @codemirror/language-data in the --browser build. The
// package's prebuilt browser file carries its own CodeMirror, so language
// descriptions built from another copy cannot be handed to it; fenced code
// stays unhighlighted there.
export const languages = undefined;
