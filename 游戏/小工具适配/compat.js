/* Small, local Chrome 61 fallbacks used only by the packaged game. */
'use strict';
const MiniCompat = {
  fromEntries(entries) { return entries.reduce((out, pair) => { out[pair[0]] = pair[1]; return out; }, {}); },
  clear(node) { while (node.firstChild) node.removeChild(node.firstChild); },
  blockControls(node, blocked) {
    if ('inert' in node) node.inert = blocked;
    node.style.pointerEvents = blocked ? 'none' : '';
    node.setAttribute('aria-hidden', String(blocked));
    Array.from(node.querySelectorAll('button,input')).forEach(child => {
      if (blocked) {
        if (child.miniTabIndex === undefined) child.miniTabIndex = child.tabIndex;
        child.tabIndex = -1;
      } else if (child.miniTabIndex !== undefined) {
        child.tabIndex = child.miniTabIndex; delete child.miniTabIndex;
      }
    });
  }
};
