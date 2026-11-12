import { defineCms } from "tenoncms";
import { posts } from "./cms/collections/posts";
// @tenon-imports

export default defineCms({
  // @tenon-options
  collections: { posts },
});
