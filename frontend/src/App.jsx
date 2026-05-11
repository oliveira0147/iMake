import { useEffect } from "react";

export default function App() {
  useEffect(() => {
    if (window.__imakeLegacyLoaded) return;
    window.__imakeLegacyLoaded = true;
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/app.js";
    script.addEventListener("error", () => {
      window.__imakeLegacyLoaded = false;
    });
    document.body.appendChild(script);
  }, []);

  return (
    <>
      <header className="topbar">
        <div className="brand">IMake</div>
        <div className="topbar-right">
          <span id="meLabel" className="muted"></span>
          <button id="logoutBtn" className="btn btn-secondary hidden">
            Sair
          </button>
        </div>
      </header>

      <main className="layout">
        <section id="authView" className="card auth-card">
          <div className="auth-head">
            <div className="auth-title">Acesse o IMake</div>
            <div className="auth-subtitle">Entre com sua conta ou crie uma nova para sua loja.</div>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Autenticação">
            <button
              id="authTabLogin"
              className="auth-tab active"
              type="button"
              role="tab"
              aria-selected="true"
              aria-controls="loginPane"
            >
              Entrar
            </button>
            <button
              id="authTabRegister"
              className="auth-tab"
              type="button"
              role="tab"
              aria-selected="false"
              aria-controls="registerPane"
            >
              Criar conta
            </button>
          </div>

          <div id="loginPane" className="auth-pane" role="tabpanel" aria-labelledby="authTabLogin">
            <form id="loginForm" className="form">
              <label>
                E-mail
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <label>
                Senha
                <input name="password" type="password" autoComplete="current-password" required minLength={6} />
              </label>
              <button className="btn btn-primary" type="submit">
                Entrar
              </button>
              <div id="loginMsg" className="msg"></div>
            </form>
          </div>

          <div id="registerPane" className="auth-pane hidden" role="tabpanel" aria-labelledby="authTabRegister">
            <form id="registerForm" className="form">
              <label>
                E-mail
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <label>
                Senha
                <input name="password" type="password" autoComplete="new-password" required minLength={6} />
              </label>
              <label>
                Confirmar senha
                <input name="password2" type="password" autoComplete="new-password" required minLength={6} />
              </label>
              <label>
                Loja (ID)
                <input name="storeId" type="text" defaultValue="loja-1" required />
              </label>
              <button className="btn btn-primary" type="submit">
                Cadastrar
              </button>
              <div id="registerMsg" className="msg"></div>
            </form>
          </div>
        </section>

        <section id="appView" className="hidden">
          <div className="grid">
            <aside className="card">
              <div className="row row-between row-gap">
                <h2>Modelos</h2>
                <button id="newTemplateBtn" className="btn btn-primary">
                  Novo
                </button>
              </div>
              <div className="row row-gap">
                <input id="searchInput" type="text" placeholder="Buscar..." />
                <button id="reloadTemplatesBtn" className="btn btn-secondary">
                  Recarregar
                </button>
              </div>
              <div id="templatesList" className="list"></div>

              <div id="adminPanel" className="hidden">
                <hr />
                <h3>Admin</h3>
                <div className="row row-gap">
                  <button id="reloadPendingBtn" className="btn btn-secondary">
                    Pendências
                  </button>
                </div>
                <div id="pendingList" className="list"></div>
              </div>
            </aside>

            <section className="card">
              <div className="row row-between row-gap">
                <div className="row row-gap">
                  <h2 id="editorTitle">Editor</h2>
                  <span id="editorMeta" className="muted"></span>
                </div>
                <div className="row row-gap">
                  <button id="saveBtn" className="btn btn-primary" disabled>
                    Salvar
                  </button>
                  <a id="exportBtn" className="btn btn-secondary disabled" href="#" download>
                    Baixar ZPL
                  </a>
                  <button id="printBtn" className="btn btn-secondary" type="button" disabled>
                    Imprimir
                  </button>
                  <button id="renameTemplateBtn" className="btn btn-secondary" type="button" disabled>
                    Renomear
                  </button>
                  <button id="deleteTemplateBtn" className="btn btn-danger" type="button" disabled>
                    Excluir
                  </button>
                </div>
              </div>

              <div className="row row-gap">
                <label className="inline">
                  Largura (mm)
                  <input id="labelWidthMm" type="number" min="5" max="2000" step="0.1" defaultValue="50" />
                </label>
                <label className="inline">
                  Altura (mm)
                  <input id="labelHeightMm" type="number" min="5" max="2000" step="0.1" defaultValue="30" />
                </label>
                <label className="inline">
                  Offset X (mm)
                  <input id="labelOffsetXMm" type="number" step="0.1" defaultValue="0" />
                </label>
                <label className="inline">
                  Offset Y (mm)
                  <input id="labelOffsetYMm" type="number" step="0.1" defaultValue="0" />
                </label>
                <label className="inline">
                  Zoom
                  <input id="zoom" type="number" min="0.25" step="0.25" defaultValue="1" />
                </label>
              </div>

              <div className="row row-gap">
                <button id="addTextBtn" className="btn btn-secondary" disabled>
                  Texto
                </button>
                <button id="addBoxBtn" className="btn btn-secondary" disabled>
                  Caixa
                </button>
                <button id="addQrBtn" className="btn btn-secondary" disabled>
                  QR
                </button>
                <button id="requestPublishBtn" className="btn btn-secondary hidden">
                  Solicitar publicação
                </button>
              </div>

              <div className="editor">
                <div className="canvas-wrap">
                  <canvas id="canvas" width="600" height="360"></canvas>
                </div>
                <div className="props">
                  <h3>Propriedades</h3>
                  <div id="propsEmpty" className="muted">
                    Selecione um objeto
                  </div>
                  <form id="propsForm" className="form hidden"></form>
                  <div className="row row-gap">
                    <button id="deleteObjBtn" className="btn btn-secondary" disabled>
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </main>
    </>
  );
}
