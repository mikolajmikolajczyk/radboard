import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import styles from './MarkdownBody.module.css';

interface MarkdownBodyProps {
  content: string;
}

export function MarkdownBody({ content }: MarkdownBodyProps) {
  return (
    <div className={styles.markdownBody}>
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className ?? '');
            const isBlock = String(children).includes('\n');
            return isBlock ? (
              <SyntaxHighlighter
                style={vscDarkPlus}
                language={match?.[1] ?? 'text'}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontFamily: "'JetBrains Mono', monospace",
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'transparent',
                }}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={styles.inlineCode} {...props}>{children}</code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
