# Guia de Teste na Central Multimídia (Android 11 / 1 GB RAM / WebView Antigo)

Este guia mostra como validar o **Car Control** em ambiente próximo ao da central automotiva antes e depois de instalar o APK no carro.

---

## 1. Validação automática local (antes de gerar o APK)

```bash
bun run build
bun run check:compat
```

O comando `bun run check:compat` verifica:
- Chunks **legacy** (`dist/assets/*-legacy-*.js` e polyfills) contra o alvo configurado em `build-target.json` (`chrome >= 50, android >= 5`).
- Fallback `dist/sql-asm.js` contra `chrome >= 50, android >= 5`.
- Chunks modernos ESM contra o alvo moderno (`chrome >= 87`).
- CSS compilado (`dist/assets/*.css`) sem `oklch()`, `color-mix()`, `@property`, `@layer`, `inset`, `backdrop-filter` indesejado ou recursos modernos (`dvh`, `aspect-ratio`, `clamp()`/`min()`/`max()`) sem fallback anterior.

---

## 2. Teste no Emulador do Android Studio (API 30 / Android 11)

1. No Android Studio, abra **Device Manager > Create Virtual Device**.
2. Escolha um perfil horizontal (ex.: **Automotive** ou **Tablet Landscape 1024x600 / 1280x720**) e selecione uma imagem **Android 11.0 (API 30)** (preferencialmente *AOSP / Android API 30* sem Play Store atualizado, que traz WebView antigo de fábrica).
3. Em **Show Advanced Settings**, limite **RAM** para `1024 MB` para simular a central de 1 GB.
4. No terminal do projeto:
   ```bash
   bun install
   bun run build:cap
   bun run check:compat
   npm run cap:sync
   npx cap open android
   ```
5. Execute o app no emulador e confira no **Logcat** se não há erros de JS/CSS ou falhas de SQLite.

---

## 3. Depuração ao vivo na Central Multimídia (`chrome://inspect`)

### Via cabo USB (ou adaptador USB-A <-> USB-A, se a central permitir depuração USB):
1. Na central, ative **Opções do desenvolvedor > Depuração USB**.
2. No PC, confira se a central aparece:
   ```bash
   adb devices
   ```

### Via Wi-Fi (ADB over Wi-Fi — mais prático dentro do carro):
1. Conecte a central e o notebook no mesmo roteador/hotspot do celular.
2. Caso a central já tenha **ADB via rede / Wi-Fi** nas Opções do Desenvolvedor (ou após ligar uma vez por USB com `adb tcpip 5555`):
   ```bash
   adb connect <IP_DA_CENTRAL>:5555
   adb devices
   ```
3. Abra o Google Chrome no PC e acesse:
   ```
   chrome://inspect/#devices
   ```
4. Clique em **inspect** abaixo de `com.carcontrol.cockpit` (WebView do Car Control).

---

## 4. O que observar no DevTools e na Central

1. **Aba Console (`chrome://inspect`)**:
   - Verifique o User-Agent real e a versão do Chromium (ex.: `Chrome/83.0...` ou `Chrome/68.0...`).
   - Se a versão for menor que a mínima testada, confira se aparece o aviso amigável de WebView antigo com o botão **"Continuar mesmo assim"**.
   - Não deve haver `SyntaxError`, `ReferenceError`, nem falha ao carregar scripts.
2. **Armazenamento e SQLite (`sql.js` + IndexedDB / `localStorage`)**:
   - Tanto no navegador/PWA quanto no APK Capacitor, confirme nos logs/Ajustes que o motor ativo é **`sql.js`** (WASM ou fallback **`sql-asm.js`**), salvando o banco serializado no **IndexedDB** (ou **`localStorage` em base64** como alternativa), sem depender de plugins nativos.
   - Cadastre um veículo, troque uma peça e veja em **Ajustes** o status **"Dados salvos neste aparelho"** com hora da última gravação e armazenamento em uso, além da opção de backup/cópia em texto.
3. **Teste de desligar a chave (ACC OFF)**:
   - Cadastre/altere o odômetro, aguarde ~3 segundos (tempo do backup automático com debounce), desligue a chave do carro por 1–2 minutos até a central cortar energia/hibernar, ligue novamente e abra o app.
   - Confirme que os dados permaneceram salvos e que o arquivo de backup existe.
4. **Memória e fluidez (1 GB RAM)**:
   - Na aba **Performance / Memory** do `chrome://inspect`, observe se o modo leve foi ativado automaticamente (ou teste em **Ajustes > Modo leve: Ligado / Automático / Desligado**) e se a troca de abas e modais abre sem travamentos.
5. **Relatório de diagnóstico**:
   - Em caso de falha na abertura, reabra o app para conferir o aviso **"O app não abriu corretamente da última vez"** e use **"Copiar relatório"** para enviar o log completo das etapas.
