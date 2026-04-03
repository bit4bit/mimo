import type { FC } from "hono/jsx";

interface LayoutProps {
  title: string;
  children: any;
}

export const Layout: FC<LayoutProps> = ({ title, children }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} | MIMO</title>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: monospace; 
            background: #1a1a1a; 
            color: #d4d4d4; 
            min-height: 100vh;
            display: flex;
            flex-direction: column;
          }
          .container { 
            max-width: 400px; 
            margin: 50px auto; 
            padding: 20px; 
          }
          h1 { color: #fff; margin-bottom: 20px; }
          form { display: flex; flex-direction: column; gap: 15px; }
          label { color: #888; font-size: 12px; text-transform: uppercase; }
          input { 
            background: #2d2d2d; 
            border: 1px solid #444; 
            color: #d4d4d4; 
            padding: 10px; 
            font-family: monospace;
          }
          input:focus { outline: none; border-color: #666; }
          button { 
            background: #333; 
            border: 1px solid #555; 
            color: #d4d4d4; 
            padding: 10px; 
            cursor: pointer;
            font-family: monospace;
          }
          button:hover { background: #444; }
          .error { color: #ff6b6b; margin-top: 10px; }
          .success { color: #51cf66; margin-top: 10px; }
          a { color: #74c0fc; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .link { margin-top: 20px; text-align: center; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
};
