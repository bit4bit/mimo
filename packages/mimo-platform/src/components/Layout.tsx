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
          .btn { 
            display: inline-block;
            background: #333; 
            border: 1px solid #555; 
            color: #d4d4d4; 
            padding: 10px 20px; 
            cursor: pointer;
            font-family: monospace;
            text-decoration: none;
            font-size: 14px;
          }
          .btn:hover { background: #444; text-decoration: none; }
          .btn-secondary {
            display: inline-block;
            background: #2d2d2d; 
            border: 1px solid #444; 
            color: #888; 
            padding: 10px 20px; 
            cursor: pointer;
            font-family: monospace;
            text-decoration: none;
            font-size: 14px;
            margin-left: 10px;
          }
          .btn-secondary:hover { background: #333; text-decoration: none; }
          .btn-danger { 
            display: inline-block;
            background: #ff6b6b; 
            border: 1px solid #ff6b6b; 
            color: #1a1a1a; 
            padding: 10px 20px; 
            cursor: pointer;
            font-family: monospace;
            font-size: 14px;
            font-weight: bold;
          }
          .btn-danger:hover { background: #ff8585; }
          .form-group { margin-bottom: 20px; }
          .form-group label { display: block; margin-bottom: 5px; }
          .form-group input, .form-group select { width: 100%; }
          .form-group small { display: block; color: #888; margin-top: 5px; }
          .actions { margin-top: 30px; }
          .project-list { display: flex; flex-direction: column; gap: 15px; }
          .project-card { 
            background: #2d2d2d; 
            border: 1px solid #444; 
            padding: 15px; 
          }
          .project-header { 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            margin-bottom: 10px;
          }
          .project-name { 
            font-weight: bold; 
            font-size: 16px;
            color: #74c0fc;
          }
          .repo-type { 
            font-size: 12px; 
            text-transform: uppercase; 
            padding: 2px 8px; 
            background: #333; 
            border-radius: 3px;
          }
          .repo-type.git { background: #6c757d; }
          .repo-type.fossil { background: #9b59b6; }
          .project-meta { color: #888; font-size: 12px; }
          .empty-state { text-align: center; padding: 40px; }
          .empty-state p { margin-bottom: 20px; color: #888; }
          .project-details { background: #2d2d2d; border: 1px solid #444; padding: 20px; }
          .detail-row { margin-bottom: 15px; }
          .detail-row label { display: block; color: #888; margin-bottom: 5px; font-size: 12px; text-transform: uppercase; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
};
