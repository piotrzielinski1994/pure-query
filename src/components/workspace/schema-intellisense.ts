import { json, jsonLanguage } from "@codemirror/lang-json";
import { hoverTooltip, type EditorView } from "@codemirror/view";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import type { JSONSchema7 } from "json-schema";
import {
  jsonCompletion,
  jsonSchemaLinter,
  jsonSchemaHover,
  stateExtensions,
  handleRefresh,
} from "codemirror-json-schema";

// The schema linter emits `severity:"error"` for every schema violation, which would make
// malformed-vs-merely-invalid indistinguishable. Downgrade every schema diagnostic to a warning so
// only true JSON syntax errors stay errors - the save path keeps blocking on syntax alone.
function asWarning(
  source: (view: EditorView) => Diagnostic[],
): (view: EditorView) => Diagnostic[] {
  return (view) =>
    source(view).map((diagnostic) => ({
      ...diagnostic,
      severity: "warning" as const,
    }));
}

// Schema-aware JSON editor extensions: the JSON language + lint gutter, plus schema-driven
// validation (as warnings), autocomplete, and hover docs sourced from `schema`. When `schema` is
// undefined (generation failed) it degrades to the plain JSON editor.
export function makeSchemaExtensions(
  schema: JSONSchema7 | undefined,
): Extension[] {
  const base: Extension[] = [json(), lintGutter()];
  if (!schema) {
    return base;
  }
  return [
    ...base,
    linter(asWarning(jsonSchemaLinter()), { needsRefresh: handleRefresh }),
    jsonLanguage.data.of({ autocomplete: jsonCompletion() }),
    hoverTooltip(jsonSchemaHover()),
    stateExtensions(schema),
  ];
}
