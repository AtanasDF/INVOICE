// A file picker dressed as a button is a <label> round an sr-only input: the
// input takes the focus, so the ring has to be drawn on the label around it.
// With the input display:none instead, a keyboard could not reach it at all.
export const FILE_RING = "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-neutral-900 has-[:focus-visible]:ring-offset-2";
