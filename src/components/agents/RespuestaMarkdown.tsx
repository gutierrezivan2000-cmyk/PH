"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Pinta la respuesta del agente con formato.
 *
 * Antes llegaba como texto plano y por eso los prompts pedían «no uses markdown
 * con asteriscos»: una lista de plazos o una tabla de mayorías se leía como un
 * párrafo corrido lleno de asteriscos. Se renderiza de verdad —encabezados,
 * listas, tablas, código— con los tokens del tema, para que funcione igual en
 * claro y en oscuro.
 */
export function RespuestaMarkdown({ children }: { children: string }) {
  return (
    <div className="respuesta-md" style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--ink)" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h3 style={{ fontSize: 17, fontWeight: 600, margin: "18px 0 8px" }} {...p} />,
          h2: (p) => <h4 style={{ fontSize: 15.5, fontWeight: 600, margin: "16px 0 6px" }} {...p} />,
          h3: (p) => <h5 style={{ fontSize: 14.5, fontWeight: 600, margin: "14px 0 6px" }} {...p} />,
          p: (p) => <p style={{ margin: "0 0 10px" }} {...p} />,
          ul: (p) => <ul style={{ margin: "0 0 10px", paddingLeft: 20, listStyle: "disc" }} {...p} />,
          ol: (p) => <ol style={{ margin: "0 0 10px", paddingLeft: 20, listStyle: "decimal" }} {...p} />,
          li: (p) => <li style={{ margin: "3px 0" }} {...p} />,
          strong: (p) => <strong style={{ fontWeight: 600, color: "var(--ink)" }} {...p} />,
          a: (p) => (
            <a
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent-text)", textDecoration: "underline" }}
              {...p}
            />
          ),
          blockquote: (p) => (
            <blockquote
              style={{
                margin: "0 0 10px",
                padding: "6px 0 6px 12px",
                borderLeft: "2px solid rgb(var(--accent-rgb) / 0.4)",
                color: "var(--ink-2)",
              }}
              {...p}
            />
          ),
          code: ({ className, children, ...rest }) => {
            const enBloque = (className || "").includes("language-");
            return enBloque ? (
              <code
                className={className}
                style={{
                  display: "block",
                  padding: 12,
                  borderRadius: 10,
                  background: "rgb(var(--veil-rgb) / 0.06)",
                  border: "1px solid rgb(var(--veil-rgb) / 0.12)",
                  fontSize: 12.5,
                  overflowX: "auto",
                  fontFamily: "'Geist Mono', ui-monospace, monospace",
                }}
                {...rest}
              >
                {children}
              </code>
            ) : (
              <code
                style={{
                  padding: "1px 5px",
                  borderRadius: 5,
                  background: "rgb(var(--veil-rgb) / 0.08)",
                  fontSize: 12.5,
                  fontFamily: "'Geist Mono', ui-monospace, monospace",
                }}
                {...rest}
              >
                {children}
              </code>
            );
          },
          // Las tablas son justo lo que un administrador pide (cuotas, plazos,
          // mayorías): se envuelven para que en móvil se desplacen en vez de
          // desbordar la pantalla.
          table: (p) => (
            <div style={{ overflowX: "auto", margin: "0 0 12px" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }} {...p} />
            </div>
          ),
          th: (p) => (
            <th
              style={{
                textAlign: "left",
                padding: "7px 10px",
                borderBottom: "1px solid rgb(var(--veil-rgb) / 0.18)",
                color: "var(--ink-2)",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
              {...p}
            />
          ),
          td: (p) => (
            <td
              style={{
                padding: "7px 10px",
                borderBottom: "1px solid rgb(var(--veil-rgb) / 0.08)",
                verticalAlign: "top",
              }}
              {...p}
            />
          ),
          hr: () => (
            <hr style={{ border: 0, borderTop: "1px solid rgb(var(--veil-rgb) / 0.12)", margin: "14px 0" }} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
