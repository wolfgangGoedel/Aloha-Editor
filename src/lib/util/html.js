/* html.js is part of Aloha Editor project http://aloha-editor.org
 *
 * Aloha Editor is a WYSIWYG HTML5 inline editing library and editor.
 * Copyright (c) 2010-2013 Gentics Software GmbH, Vienna, Austria.
 * Contributors http://aloha-editor.org/contribution.php
 *
 * Aloha Editor is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or any later version.
 *
 * Aloha Editor is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 *
 * As an additional permission to the GNU GPL version 2, you may distribute
 * non-source (e.g., minimized or compacted) forms of the Aloha-Editor
 * source code without the copy of the GNU GPL normally required,
 * provided you include this license notice and a URL through which
 * recipients can access the Corresponding Source.
 */
define([
	'jquery',
	'util/dom2',
	'util/maps',
	'util/arrays'
], function (
	$,
	Dom,
	Maps,
	Arrays
) {
	'use strict';

	// White space characters as defined by HTML 4 (http://www.w3.org/TR/html401/struct/text.html)
	var nonWhitespaceRx = /[^\r\n\t\f \u200B]/;

	var nonBlockDisplayValuesMap = {
		"inline": true,
		"inline-block": true,
		"inline-table": true,
		"none": true
	};

	var blockTypeNodes = {
		'P': true,
		'H1': true,
		'H2': true,
		'H3': true,
		'H4': true,
		'H5': true,
		'H6': true,
		'OL': true,
		'UL': true,
		'PRE': true,
		'ADDRESS': true,
		'BLOCKQUOTE': true,
		'DL': true,
		'DIV': true,
		'fieldset': true,
		'FORM': true,
		'HR': true,
		'NOSCRIPT': true,
		'TABLE': true
	};

	/**
	 * From engine.js
	 * "A block node is either an Element whose "display" property does not have
	 * resolved value "inline" or "inline-block" or "inline-table" or "none", or a
	 * Document, or a DocumentFragment."
	 * Note that this function depends on style inheritance which only
	 * works if the given node is attached to the document.
	 */
	function hasBlockStyle(node) {
		return node && ((node.nodeType == 1 && !nonBlockDisplayValuesMap[Dom.getComputedStyle(node, 'display')])
						|| node.nodeType == 9
						|| node.nodeType == 11);
	}

	/**
	 * From engine.js:
	 * "An inline node is a node that is not a block node."
	 * Note that this function depends on style inheritance which only
	 * works if the given node is attached to the document.
	 */
	function hasInlineStyle(node) {
		return !hasBlockStyle(node);
	}

	/**
	 * From engine.js:
	 * "An editing host is a node that is either an Element with a contenteditable
	 * attribute set to the true state, or the Element child of a Document whose
	 * designMode is enabled."
	 * The check for design mode was removed because we only care about
	 * contenteditable in Aloha.
	 */
	function isEditingHost(node) {
		return 1 === node.nodeType && "true" === node.contentEditable;
	}

	/**
	 * Similar to hasBlockStyle() except relies on the nodeName of the
	 * given node which works for attached as well as and detached
	 * nodes.
	 */
	function isBlockType(node) {
		return blockTypeNodes[node.nodeName];
	}

	/**
	 * isInlineType() is similar to hasInlineStyle()
	 * in the same sense as
	 * isBlockType() is similar to hasBlockStyle()
	 */
	function isInlineType(node) {
		return !isBlockType(node);
	}

	var inlineFormattableMap = {
		'A': true,
		'B': true,
		'EM': true,
		'FONT': true,
		'I': true,
		'S': true,
		'SPAN': true,
		'STRIKE': true,
		'STRONG': true,
		'SUB': true,
		'SUP': true,
		'U': true
	};

	// NB: "block-level" is not technically defined for elements that are new in
	// HTML5.
	var BLOCKLEVEL_ELEMENTS = [
		'address',
		'article',    // HTML5
		'aside',      // HTML5
		'audio',      // HTML5
		'blockquote',
		'canvas',     // HTML5
		'dd',
		'div',
		'dl',
		'fieldset',
		'figcaption',
		'figure',
		'footer',
		'form',
		'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
		'header',
		'hgroup',
		'hr',
		'noscript',
		'ol',
		'output',
		'p',
		'pre',
		'section',   // HTML5
		'table',
		'tfoot',
		'ul',
		'video'      // HTML5
	];

	/**
	 * Map containing lowercase and uppercase tagnames of block element as keys
	 * mapped against true.
	 *
	 * @type {object<string, boolean>}
	 */
	var blocksTagnameMap = {};
	Maps.fillKeys(blocksTagnameMap, BLOCKLEVEL_ELEMENTS, true);
	Maps.fillKeys(
		blocksTagnameMap,
		Arrays.map(BLOCKLEVEL_ELEMENTS, function (str) {
			return str.toUpperCase();
		}),
		true
	);

	/**
	 * @todo: move to dom2.js1
	 */
	function isBlock(node) {
		return node && blocksTagnameMap[node.nodeName];
	}

	/**
	 * @todo: improve by ignoring zero-width-spaces
	 */
	function isIgnorableWhitespace(node) {
		return 3 === node.nodeType && !node.length;
	}

	function isWhiteSpacePreserveStyle(cssWhiteSpaceValue) {
		return (cssWhiteSpaceValue === 'pre'
				|| cssWhiteSpaceValue === 'pre-wrap'
				|| cssWhiteSpaceValue === '-moz-pre-wrap');
	}

	/**
	 * Returns true if the given node is unrendered whitespace, with the
	 * caveat that it only examines the given node and not any siblings.
	 * An additional check is necessary to determine whether the node
	 * occurs after/before a linebreaking node.
	 *
	 * If is also necessary to check whether the node is immediately following a
	 * start tag or immediately before an end tag, since nodes at these terminal
	 * positions must not be rendered if they only contain zero-width and white
	 * spaces characters.
	 *
	 * @see: http://www.w3.org/TR/html401/struct/text.html#h-9.1
	 *
	 * Taken from
	 * http://code.google.com/p/rangy/source/browse/trunk/src/js/modules/rangy-cssclassapplier.js
	 * under the MIT license.
	 */
	function isUnrenderedWhitespaceNoBlockCheck(node) {
		if (3 !== node.nodeType) {
			return false;
		}
		if (!node.length) {
			return true;
		}
		if (nonWhitespaceRx.test(node.nodeValue)) {
			return false;
		}
        var cssWhiteSpace = Dom.getComputedStyle(node.parentNode, 'white-space');
		if (isWhiteSpacePreserveStyle(cssWhiteSpace)) {
			return false;
		}
		if ('pre-line' === cssWhiteSpace) {
            if (/[\r\n]/.test(node.data)) {
                return false;
            }
        }
		return true;
	}

	/**
	 * Empty inline elements are unrendered, with the exception of img
	 * and br elements. Idea from engine.js.
	 */
	function isRenderedEmptyInlineNode(node) {
		return 'IMG' === node.nodeName || 'BR' === node.nodeName;
	}

	/**
	 * Returns true for nodes that introduce linebreaks.
	 */
	function isLinebreakingNode(node) {
		return 'BR' === node.nodeName || hasBlockStyle(node);
	}

	/**
	 * Returns true if the node at point is unrendered, with the caveat
	 * that it only examines the node at point and not any siblings.
	 * An additional check is necessary to determine whether the
	 * whitespace occurrs after/before a linebreaking node.
	 */
	function isUnrenderedAtPoint(point) {
		return (isUnrenderedWhitespaceNoBlockCheck(point.node)
				|| (1 === point.node.nodeType
					&& hasInlineStyle(point.node)
					&& !isRenderedEmptyInlineNode(point.node)));
	}

	/**
	 * Tries to move the given point to the end of the line, stopping to
	 * the left of a br or block node, ignoring any unrendered
	 * nodes. Returns true if the point was successfully moved to the
	 * end of the line, false if some rendered content was encountered
	 * on the way. point will not be mutated unless true is returned.
	 */
	function skipUnrenderedToEndOfLine(point) {
		var cursor = point.clone();
		cursor.nextWhile(isUnrenderedAtPoint);
		if (!isLinebreakingNode(cursor.node)) {
			return false;
		}
		point.setFrom(cursor);
		return true;
	}

	/**
	 * Tries to move the given point to the start of the line, stopping
	 * to the right of a br or block node, ignoring any unrendered
	 * nodes. Returns true if the point was successfully moved to the
	 * start of the line, false if some rendered content was encountered
	 * on the way. point will not be mutated unless true is returned.
	 */
	function skipUnrenderedToStartOfLine(point) {
		var cursor = point.clone();
		cursor.prev();
		cursor.prevWhile(isUnrenderedAtPoint);
		if (!isLinebreakingNode(cursor.node)) {
			return false;
		}
		var isBr = ('BR' === cursor.node.nodeName);
		cursor.next(); // after/out of the linebreaking node
		// Because point may be to the right of a br at the end of a
		// block, in which case the line starts before the br.
		if (isBr) {
			var endOfBlock = point.clone();
			if (skipUnrenderedToEndOfLine(endOfBlock) && endOfBlock.atEnd) {
				cursor.skipPrev(); // before the br
				cursor.prevWhile(isUnrenderedAtPoint);
				if (!isLinebreakingNode(cursor.node)) {
					return false;
				}
				cursor.next(); // after/out of the linebreaking node
			}
		}
		point.setFrom(cursor);
		return true;
	}

	/**
	 * Tries to move the given boundary to the start of line, skipping
	 * over any unrendered nodes, or if that fails to the end of line
	 * (after a br element if present), and for the last line in a
	 * block, to the very end of the block.
	 *
	 * If the selection is inside a block with only a single empty line
	 * (empty except for unrendered nodes), and both boundary points are
	 * normalized, the selection will be collapsed to the start of the
	 * block.
	 *
	 * For some operations it's useful to think of a block as a number
	 * of lines, each including its respective br and any preceding and
	 * following unrendered whitespace.
	 */
	function normalizeBoundary(point) {
		if (skipUnrenderedToStartOfLine(point)) {
			return true;
		}
		if (!skipUnrenderedToEndOfLine(point)) {
			return false;
		}
		if ('BR' === point.node.nodeName) {
			point.skipNext();
			// Because, if this is the last line in a block, any
			// unrendered whitespace after the last br will not
			// constitute an independent line, and as such we must
			// include it in the last line.
			var endOfBlock = point.clone();
			if (skipUnrenderedToEndOfLine(endOfBlock) && endOfBlock.atEnd) {
				point.setFrom(endOfBlock);
			}
		}
		return true;
	}

	/**
	 * Returns true if the given node is unrendered whitespace.
	 */
	function isUnrenderedWhitespace(node) {
		if (!isUnrenderedWhitespaceNoBlockCheck(node)) {
			return false;
		}
		// Algorithm like engine.js isCollapsedWhitespaceNode().
		return skipUnrenderedToEndOfLine(Dom.cursor(node, false)) || skipUnrenderedToStartOfLine(Dom.cursor(node, false));
	}

	/**
	 * Checks whether the given element is a block that contains a "propping"
	 * <br> element.
	 *
	 * A propping <br> is one which is inserted into block element to ensure
	 * that the otherwise empty element will be rendered visibly.
	 *
	 * @param {HTMLElement} node
	 * @return {boolean} True if node contains a propping <br>
	 */
	function isProppedBlock(node) {
		if (!blocksTagnameMap[node.nodeName]) {
			return false;
		}
		var found = false;
		var kids = node.children;
		var len = kids.length;
		var i;
		for (i = 0; i < len; i++) {
			if (!found && 'br' === kids[i].nodeName.toLowerCase()) {
				found = true;
			} else if (!isIgnorableWhitespace(kids[i])) {
				return false;
			}
		}
		return found;
	}

	/**
	 * Starting from the given node, and working backwards through the siblings,
	 * find the node that satisfies the given condition.
	 *
	 * @param {HTMLElement} node The node at which to start the search.
	 * @param {function(HTMLElement):boolean} condition A predicate the receives
	 *                                        one of children of `node`.
	 *
	 * @return {HTMLElement} The first node that meets the given condition.
	 */
	function findNodeRight(node, condition) {
		while (node && !condition(node)) {
			node = node.previousSibling;
		}
		return node;
	}

	function isEmpty(elem) {
		var child = elem.firstChild;
		while (child) {
			if (!isUnrenderedWhitespace(child)
				    && (1 === child.nodeType || 3 === child.nodeType)) {
				return true;
			}
			child = child.nextSibling;
		}
		return true;
	}

	/**
	 * Checks if the given editable is a valid container for paragraphs.
	 *
	 * @param {Aloha.Editable} editable The editable to be checked
	 *
	 * @return {boolean} False if the editable may not contain paragraphs
	 */
	function allowNestedParagraph(editable) {
		if (editable.obj.prop("tagName") === "SPAN" ||
				editable.obj.prop("tagName") === "P") {
			return false;
		}
		return true;
	}

	// TODO currently this function only knows about 'background-color'
	// not being inherited, while 'color', 'font-size', 'font-family'
	// are inherited. Any other relevant styles should be added when
	// needed.
	function isStyleInherited(styleName) {
		return 'background-color' !== styleName;
	}

	/**
	 * Returns true if the given character is a control
	 * character. Control characters are usually not rendered if they
	 * are inserted into the DOM. Returns false for whitespace 0x20
	 * (which may or may not be rendered see isUnrenderedWhitespace())
	 * and non-breaking whitespace 0xa0 but returns true for tab 0x09
	 * and linebreak 0x0a and 0x0d.
	 */
	function isControlCharacter(chr) {
		// Regex matches C0 and C1 control codes, which seems to be good enough.
		// "The C0 set defines codes in the range 00HEX–1FHEX and the C1
		// set defines codes in the range 80HEX–9FHEX."
		// In addition, we include \x007f which is "delete", which just
		// seems like a good idea.
		// http://en.wikipedia.org/wiki/List_of_Unicode_characters
		// http://en.wikipedia.org/wiki/C0_and_C1_control_codes
		return (/[\x00-\x1f\x7f-\x9f]/).test(chr);
	}

	/**
	 * Unicode space characters as defined in the W3 HTML5 specification:
	 * http://www.w3.org/TR/html5/infrastructure.html#common-parser-idioms
	 *
	 * @const
	 * @type {Array.<string>}
	 */
	var SPACE_CHARACTERS = [
		'\\u0009', // TAB
		'\\u000A', // LF
		'\\u000C', // FF
		'\\u000D', // CR
		'\\u0020'  // SPACE
	];

	/**
	 * Unicode zero width space characters:
	 * http://www.unicode.org/Public/UNIDATA/Scripts.txt
	 *
	 * @const
	 * @type {Array.<string>}
	 */
	var ZERO_WIDTH_CHARACTERS = [
		'\\u200B', // ZWSP
		'\\u200C',
		'\\u200D',
		'\\uFEFF'  // ZERO WIDTH NO-BREAK SPACE
	];

	/**
	 * Unicode White_Space characters are those that have the Unicode property
	 * "White_Space" in the Unicode PropList.txt data file.
	 *
	 * http://www.unicode.org/Public/UNIDATA/PropList.txt
	 *
	 * @const
	 * @type {Array.<string>}
	 */
	var WHITE_SPACE_CHARACTERS_UNICODES = [
		'\\u0009',
		'\\u000A',
		'\\u000B',
		'\\u000C',
		'\\u000D',
		'\\u0020',
		'\\u0085',
		'\\u00A0', // NON BREAKING SPACE ("&nbsp;")
		'\\u1680',
		'\\u180E',
		'\\u2000',
		'\\u2001',
		'\\u2002',
		'\\u2003',
		'\\u2004',
		'\\u2005',
		'\\u2006',
		'\\u2007',
		'\\u2008',
		'\\u2009',
		'\\u200A',
		'\\u2028',
		'\\u2029',
		'\\u202F',
		'\\u205F',
		'\\u3000'
	];

	var wspChars = WHITE_SPACE_CHARACTERS_UNICODES.join('');

	/**
	 * Regular expression that matches one or more sequences of white space
	 * characters.
	 *
	 * @type {RegExp}
	 */
	var WSP_CHARACTERS = new RegExp('[' + wspChars + ']+');

	/**
	 * Regular expression that matches one or more sequences of zero width
	 * characters.
	 *
	 * @type {RegExp}
	 */
	var ZWSP_CHARACTERS = new RegExp('[' + ZERO_WIDTH_CHARACTERS.join('') + ']+');

	/**
	 * Regular expression that matches one or more sequences of white space
	 * characters at the start of a string.
	 *
	 * @type {RegExp}
	 */
	var WSP_CHARACTERS_FROM_START = new RegExp('^[' + wspChars + ']+');

	/**
	 * Regular expression that matches zero or more sequences of white space
	 * characters at the end of a string.
	 *
	 * @type {RegExp}
	 */
	var WSP_CHARACTERS_FROM_END   = new RegExp('[' + wspChars + ']+$');

	/**
	 * Checks whether or not a given node is a text node that consists of only
	 * sequence of white space characters as defined by W3 specification:
	 *
	 * http://www.w3.org/TR/html401/struct/text.html#h-9.1
	 *
	 * @param {HTMLELement} node
	 * @return {boolean} True is node is a textNode of white characters.
	 */
	function isWhitespaces(node) {
		return WSP_CHARACTERS.test(node.data);
	}

	/**
	 * Checks whether or not a given node is a text node that consists of only
	 * sequence of zero-width characters.
	 *
	 * @param {HTMLELement} node
	 * @return {boolean} True is node is a textNode of zero-width characters
	 */
	function isZeroWidthCharacters(node) {
		return ZWSP_CHARACTERS.test(node.data);
	}

	/**
	 * Collects a sequence of contiguous nodes, that match a given condition in
	 * a specified direction, adjacent to the a node.
	 *
	 * http://www.w3.org/TR/html5/infrastructure.html#collect-a-sequence-of-characters
	 *
	 * @param {String} direction
	 * @param {HTMLElement} node
	 * @param {function(HTMLElement):boolean} condition
	 * @return {Array.<HTMLElements>} A list of contiguous nodes to the left of
	 *                                `node`.
	 */
	function collectNodesUntil(direction, node, condition) {
		var next = 'left' === direction ? 'previousSibling' : 'nextSibling';
		node = node[next];
		var nodes = [];
		while (node && condition(node)) {
			nodes.push(node);
			node = node[next];
		}
		return nodes;
	}

	/**
	 * Collects a sequence of contiguous nodes left adjacent to given node,
	 * until the specified condition is broken.
	 *
	 * @param {HTMLElement} node
	 * @param {function(HTMLElement):boolean} condition
	 * @return {Array.<HTMLElement>} List of contiguous nodes
	 */
	function collectNodesLeftUntil(node, condition) {
		return collectNodesUntil('left', node, condition);
	}

	/**
	 * Collects a sequence of contiguous nodes right adjacent to given node,
	 * until the specified condition is broken.
	 *
	 * Symmetrical to collectNodeLeftUntil()
	 *
	 * @param {HTMLElement} node
	 * @param {function(HTMLElement):boolean} condition
	 * @return {Array.<HTMLElement>} List of contiguous nodes
	 */
	function collectNodesRightUntil(node, condition) {
		return collectNodesUntil('right', node, condition);
	}

	/**
	 * Trims the given text node using the specified regular expression (either
	 * WSP_CHARACTERS_FROM_START or WSP_CHARACTERS_FROM_END), and return the
	 * number of characters removed.
	 *
	 * @todo: Unuse a replace function that will preseve range
	 *
	 * @param {HTMLElement} node
	 * @param {RegExp} regexp
	 * @return {object} And object containining the property `delta` and `pos`.
	 */
	function trimNode(node, regex) {
		if (!node.data) {
			return {
				node: node,
				position: 0,
				delta: 0,
				direction: 'left'
			};
		}
		var originalLength = node.length;
		var offset;
		// https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/replace
		node.data = node.data.replace(regex, function () {
			offset = arguments[arguments.length - 2];
			return '';
		});
		return {
			node: node,
			position: offset || 0,
			delta: originalLength - node.data.length,
			direction: offset ? 'right' : 'left'
		};
	}

	/**
	 * Trims a node of white space characters from the start.
	 *
	 * @param {HTMLElement} node
	 * @return {object}
	 */
	function trimNodeLeft(node) {
		return trimNode(node, WSP_CHARACTERS_FROM_START);
	}

	/**
	 * Trims a node of white space characters from the end.
	 *
	 * @param {HTMLElement} node
	 * @return {object}
	 */
	function trimNodeRight(node) {
		return trimNode(node, WSP_CHARACTERS_FROM_END);
	}

	/**
	 * Adjust a range's offset based on whether the deletion that took place
	 * during a trimNode() operation.
	 *
	 * @param {number} offset
	 * @param {object} deletion
	 */
	function adjustOffsetAfterTrim(offset, direction, delta, position) {
		if ('left' === direction) {
			return (position > offset)
				? offset - delta + (position - offset)
				: offset - delta;
		}
		return (position < offset)
			? offset - delta + (offset - position)
			: offset;
	}

	/**
	 * Corrects the range offsets as needed depending on the number of
	 * characters that were removed after trimming the given node.
	 *
	 * @param {Range} range
	 * @param {object} deletion
	 */
	function adjustRangeAfterTrim(range, deletion) {
		if (!range) {
			return;
		}
		if (deletion.node === range.startContainer) {
			range.startOffset = adjustOffsetAfterTrim(
				range.startOffset,
				deletion.direction,
				deletion.delta,
				deletion.position
			);
		}
		if (deletion.node === range.endContainer) {
			range.endOffset = adjustOffsetAfterTrim(
				range.endOffset,
				deletion.direction,
				deletion.delta,
				deletion.position
			);
		}
	}

	/**
	 * Checks whether the given node positioned at either extremity of it's
	 * sibling linked list.
	 *
	 * @param {HTMLElement} node
	 * @return {boolean} True if node is wither the first or last child of its
	 *                   parent.
	 */
	function isTerminalSibling(node) {
		var parent = node.parentNode;
		return parent && (
			node === parent.firstChild || node === parent.lastChild
		);
	}

	/**
	 * Checks whether the given node is next to a block level elemnt.
	 *
	 * @param {HTMLElement} node
	 * @return {boolean}
	 */
	function isAdjacentToBlock(node) {
		return isBlock(node.previousSibling) || isBlock(node.nextSibling);
	}

	function isUnrenderedNode(node) {
		if (!node) {
			return false;
		}

		// Because isUnrenderedWhiteSpaceNoBlockCheck() will give us false
		// positives but never false negatives, the algorithm that will follow
		// will make certain, and will also consider unrendered <br>s.
		var maybeUnrenderedNode = isUnrenderedWhitespaceNoBlockCheck(node);

		// Because a <br> element that is a child node adjacent to its parent's
		// end tag (terminal sibling) must not be rendered.
		if (
			!maybeUnrenderedNode
				&& (node === node.parentNode.lastChild)
					&& isBlock(node.parentNode)
						&& 'BR' === node.nodeName
		) {
			return true;
		}

		if (
			maybeUnrenderedNode
				&& (
					isTerminalSibling(node)
						|| isAdjacentToBlock(node)
							|| skipUnrenderedToEndOfLine(Dom.cursor(node, false))
								|| skipUnrenderedToStartOfLine(Dom.cursor(node, false))
				)
		) {
			return true;
		}

		return false;
	}

	/**
	 * Removes an elements unrendered child nodes that are either immediately
	 * after an opening tag, or immediately before a closing tag.
	 *
	 * The range will be preserved.
	 *
	 * This function is useful for preparing the given node for being unwrapped.
	 *
	 * @param {HTMLElement} node
	 * @param {Range} range
	 */
	function removeUnrenderedTerminalChildren(node, range) {
		if (!node.firstChild) {
			return;
		}
		if (Dom.isTextNode(node.firstChild)) {
			adjustRangeAfterTrim(range, trimNodeLeft(node.firstChild));
		}
		if (isUnrenderedNode(node.firstChild)) {
			Dom.removePreservingRange(node.firstChild, range);
		}
		if (Dom.isTextNode(node.lastChild)) {
			adjustRangeAfterTrim(range, trimNodeRight(node.lastChild));
		}
		if (isUnrenderedNode(node.lastChild)) {
			Dom.removePreservingRange(node.lastChild, range);
		}
	}

	function removeUnrenderedAdjacentSiblings(node, range) {
		var unrenderedAdjacentSiblings = [].concat(
			collectNodesLeftUntil(node, isWhitespaces),
			collectNodesLeftUntil(node, isZeroWidthCharacters),
			collectNodesRightUntil(node, isWhitespaces),
			collectNodesRightUntil(node, isZeroWidthCharacters)
		);
		var i;
		for (i = 0; i < unrenderedAdjacentSiblings.length; i++) {
			Dom.removePreservingRange(unrenderedAdjacentSiblings[i], range);
		}
	}

	/**
	 * Unrwaps the given node while maintaining the range.
	 *
	 * The node that is to be unwrapped (1 element) will be replaced by its
	 * contents (contents().length elements)
	 *
	 * @param {HTMLElement} node
	 * @param {Range} range
	 */
	function unwrapPreservingRange(node, range) {
		var index = Dom.nodeIndex(node);
		var parent = node.parentNode;
		var numChildNodes = Dom.nodeLength(parent);
		var start = range.startOffset;
		var end = range.endOffset;

		if (range.startContainer === parent && start > index) {
			start += numChildNodes - 1;
		}
		if (range.endContainer === parent && end > index) {
			end += numChildNodes - 1;
		}

		$(node).unwrap();

		range.startOffset = start;
		range.endOffset = end;
	}

	/**
	 * Unwrap a element which is a child of a block-level node, while preserving
	 * virtical orientation.
	 *
	 * SGML (see [ISO8879], section 7.6.1) specifies that a line break
	 * immediately following a start tag must be ignored, as must a line break
	 * immediately before an end tag. This applies to all HTML elements without
	 * exception.
	 *
	 * The browser ignores all white spaces at these positions, not only line
	 * break characters.
	 *
	 * The following two HTML examples must be rendered identically:
	 *
	 * <P>Thomas is watching TV.</P>
	 * <P>
	 * Thomas is watching TV.
	 * </P>
	 *
	 * WARNING:
	 * Chrome (at least) does not seem to follow this rule onsistantly with
	 * inline elements.  For example, the following two HTML snippets should be
	 * rendered as "|foo|" according to the specification:
	 *
	 * |<span>foo</span>|
	 *
	 * |<span>
	 * foo
	 * </span>|
	 *
	 * yet Chrome renders the second with single white spaces around "foo":
	 * "| foo |".
	 *
	 * Todo:
	 * We must also ignore <br>s that are adjecent to an opening or closing
	 * block level element, since they too are unrendered in non IE-browsers.
	 *
	 * See also:
	 * https://bugzilla.mozilla.org/show_bug.cgi?id=69032#c23
	 * https://www.mozdev.org/pipermail/mozile/2006-June/001057.html
	 *
	 * References:
	 * http://www.w3.org/TR/html401/struct/text.html#h-9.1
	 * http://www.w3.org/TR/html401/struct/text.html#line-breaks
	 * http://www.w3.org/TR/html401/appendix/notes.html#notes-line-breaks
	 *
	 * @param {HTMLElement} node A node whose parent is a block level element.
	 * @param {Range} range
	 */
	function unwrapBlockChild(node, range) {
		var parent = node.parentNode;

		// Because in the course of unwrapping the <span> node, unrendered node
		// must be pruned, before the wrapping parent node is removed.
		//
		//          (unwrapping)
		// (remove)     node
		//  parent       |
		//    |          |
		//    | (remove) | (remove) (remove)   (remove)
		//    | adjacent | terminal terminal   adjacent
		//    | sibling  |  child    child     sibling
		//    |   |      |   |       |            |
		//    v   v      v   v       v            v
		//   <p><wsp><span><wsp>foo<br/></span><zwsp></p>

		removeUnrenderedTerminalChildren(parent, range);

		removeUnrenderedAdjacentSiblings(parent, range);

		// Because appending adds content at the very end of the container
		// element, the content will always be within  the range if the
		// container happens to be the parent container.
		$(parent).append('<br/>');

		// Because the node itself may have been removed during removal of
		// unrendered nodes, and may therefore be detached.
		if (node.parentNode) {
			unwrapPreservingRange(node, range);
		}
	}

	/**
	 * Unwraps the given node from its parent element, while preserving the
	 * range and the vertical orientation of the node around its adjacent
	 * content.
	 *
	 * The node's vertical orientation is preserved by inserting <br> elements
	 * where needed.  The algorithm for doing so relies on the semantic property
	 * of nodes rather than CSS because that would not work with trees that are
	 * disconnected from the document.
	 *
	 * This function does not accomodate much of what a CSS render can do:
	 * elements that are positioned using floating or relative or absolute
	 * positioning, alignment, elements that are z-indexed or overlapping,
	 * elements thar are transformed with CSS3.
	 *
	 * We may later want to consider what to do with the inevitable cases where
	 * CSS effects layout (eg: the CSS "display" property).
	 *
	 * See discussion on standardizing innerHTML for more insight:
	 * http://lists.whatwg.org/pipermail/whatwg-whatwg.org/2011-February/030179.html
	 *
	 * Therefore, unwrapping the <p> elements in:
	 * "<p>foo</p><p>bar</p>"
	 * will yield:
	 * foo<br/>bar
	 *
	 * @param {HTMLElement} node
	 * @param {Range} range
	 */
	function unwrapNode(node, range) {
		if (!node.parentNode || isEditingHost(node.parentNode)) {
			return;
		}
		if (isBlock(node.parentNode)) {
			unwrapBlockChild(node, range);
		} else {
			unwrapPreservingRange(node, range);
		}
	}

	/**
	 * Unwraps the a list of nodes while preserving the range, and vertical
	 * orientation.
	 *
	 * @see unwrapNode()
	 *
	 * @param {Array.<HTMLElements>} nodes
	 * @param {Range} range
	 */
	function unwrapNodes(nodes, range) {
		var i;
		for (i = 0; i < nodes.length; i++) {
			unwrapNode(nodes[i], range);
		}
	}

	return {
		isControlCharacter: isControlCharacter,
		isStyleInherited: isStyleInherited,
		BLOCKLEVEL_ELEMENTS: BLOCKLEVEL_ELEMENTS,
		isBlockType: isBlockType,
		isInlineType: isInlineType,
		hasBlockStyle: hasBlockStyle,
		hasInlineStyle: hasInlineStyle,
		isBlock: isBlock,
		isUnrenderedWhitespace: isUnrenderedWhitespace,
		isWhiteSpacePreserveStyle: isWhiteSpacePreserveStyle,
		skipUnrenderedToStartOfLine: skipUnrenderedToStartOfLine,
		skipUnrenderedToEndOfLine: skipUnrenderedToEndOfLine,
		normalizeBoundary: normalizeBoundary,
		isIgnorableWhitespace: isIgnorableWhitespace,
		isEmpty: isEmpty,
		isProppedBlock: isProppedBlock,
		isEditingHost: isEditingHost,
		findNodeRight: findNodeRight,
		allowNestedParagraph: allowNestedParagraph,
		unwrapNode: unwrapNode,
		unwrapNodes: unwrapNodes
	};
});
