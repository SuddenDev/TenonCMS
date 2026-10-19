import type { RichtextBrowserExtension } from "integral-cms/richtext";
import { Notice } from "../notice.ts";

/** Browser implementation of the example plugin's rich text feature. */
export const notice: RichtextBrowserExtension = {
  extensions: [Notice],
  controls: [
    {
      label: { en: "Notice", de: "Hinweis" },
      active: (editor) => editor.isActive("exampleNotice"),
      run: (editor) => {
        editor.chain().focus().toggleWrap("exampleNotice").run();
      },
    },
  ],
};
