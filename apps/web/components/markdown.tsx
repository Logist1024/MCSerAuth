import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renders forum Markdown. Raw HTML is not rendered (react-markdown default). */
export default function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
          img: ({ src, alt }) =>
            typeof src === 'string' && /^https?:\/\//i.test(src) ? (
              <img src={src} alt={alt ?? ''} loading="lazy" />
            ) : null,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
