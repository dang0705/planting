import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({
  // Parse raw HTML only so DOMPurify can remove disallowed elements and
  // attributes before the string reaches uni-app rich-text.
  html: true,
  breaks: true,
  linkify: false,
  typographer: false
})

// Let DOMPurify remove unsafe hrefs while keeping the visible link label.
markdown.validateLink = () => true

const sanitizeOptions = {
  ALLOWED_TAGS: [
    'a',
    'blockquote',
    'br',
    'code',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'li',
    'ol',
    'p',
    'pre',
    'strong',
    'ul'
  ],
  ALLOWED_ATTR: ['class', 'href', 'title', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
  FORBID_ATTR: ['style']
}

/**
 * Convert assistant Markdown into safe HTML for the H5 rich-text renderer.
 * Raw HTML is parsed only so DOMPurify can remove disallowed elements and
 * attributes before the rendering boundary receives model-provided markup.
 */
export function renderMarkdown(value) {
  const source = String(value ?? '')
  if (!source) {
    return ''
  }
  return DOMPurify.sanitize(markdown.render(source), sanitizeOptions)
}
