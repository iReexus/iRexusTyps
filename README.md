# iRexusTyps

Library Node.js untuk berinteraksi dengan **WhatsApp Web** lewat WebSocket — tanpa browser, tanpa Selenium.

iRexusTyps adalah remake dari [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys).

- QR code & pairing code
- Kirim/terima pesan: teks, gambar, video, dokumen, audio, sticker, reply
- ESM, Node.js 20+

## Instalasi

Belum dipublikasikan ke npm registry, install langsung dari GitHub:

```bash
npm install github:iReexus/iRexusTyps
```

atau di `package.json`:

```json
"dependencies": {
  "iRexusTyps": "github:iReexus/iRexusTyps"
}
```

Saat instalasi, npm otomatis menjalankan build (`prepare` script).

### Dari folder lokal

```bash
npm install file:../iRexusTyps
```

### Dari tarball

```bash
npm pack
npm install ./iRexusTyps-7.0.0-rc12.tgz
```

### Development (dari repo)

```bash
corepack enable
yarn install
yarn build
```

## Cara Connect ke WhatsApp

### Opsi 1 — Scan QR

```js
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason
} from 'iRexusTyps'
import pino from 'pino'
import qrcode from 'qrcode-terminal'

const logger = pino({ level: 'silent' })

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    }
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      console.log('Terhubung ke WhatsApp')
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      if (statusCode === DisconnectReason.loggedOut) {
        console.log('Logged out. Hapus folder auth_info, lalu scan ulang.')
      } else {
        startBot()
      }
    }
  })

  return sock
}

startBot()
```

Dependency tambahan untuk contoh di atas:

```bash
npm install qrcode-terminal pino
```

Jalankan, lalu scan QR dengan WhatsApp di HP: **Perangkat Tertaut → Tautkan perangkat**.

### Opsi 2 — Pairing Code

Sama seperti di atas, tapi ganti handler `connection.update`:

```js
sock.ev.on('connection.update', async ({ connection, qr }) => {
  if (qr && !sock.authState.creds.registered) {
    const phoneNumber = '6281234567890'
    const code = await sock.requestPairingCode(phoneNumber)
    console.log('Pairing code:', code)
  }

  if (connection === 'open') {
    console.log('Terhubung ke WhatsApp')
  }
})
```

Masukkan kode 8 digit di WhatsApp: **Perangkat Tertaut → Tautkan dengan nomor telepon**.

## Mengirim Pesan

```js
const jid = '6281234567890@s.whatsapp.net'

// teks
await sock.sendMessage(jid, { text: 'Halo dari iRexusTyps!' })

// gambar (URL atau path file lokal)
await sock.sendMessage(jid, { image: { url: './foto.jpg' }, caption: 'Caption' })

// dokumen
await sock.sendMessage(jid, {
  document: { url: './file.pdf' },
  fileName: 'file.pdf',
  mimetype: 'application/pdf'
})

// reply ke pesan masuk
await sock.sendMessage(jid, { text: 'Balasan' }, { quoted: msg })
```

Cek nomor terdaftar WhatsApp:

```js
const [result] = await sock.onWhatsApp('6281234567890')
if (result?.exists) {
  await sock.sendMessage(result.jid, { text: 'Halo!' })
}
```

Untuk kirim ke grup, pakai JID grup (`...@g.us`) — bisa didapat dari `msg.key.remoteJid` di `messages.upsert`.

## Button / Pesan Interaktif

Format button lama (`buttonsMessage`, `templateMessage`) sudah tidak didukung WhatsApp dan helper-nya tidak ada di library ini. Untuk mengirim button, pakai `interactiveMessage` + `nativeFlowMessage` lewat `generateWAMessageFromContent` dan `sock.relayMessage`:

```js
import { generateWAMessageFromContent } from 'iRexusTyps'

const msg = generateWAMessageFromContent(
  jid,
  {
    interactiveMessage: {
      body: { text: 'Pilih menu:' },
      footer: { text: 'iRexusTyps' },
      nativeFlowMessage: {
        buttons: [
          {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: 'Cek Saldo', id: 'saldo' })
          },
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({ display_text: 'Buka Web', url: 'https://example.com' })
          }
        ]
      }
    }
  },
  { userJid: sock.user.id }
)

await sock.relayMessage(jid, msg.message, { messageId: msg.key.id })
```

Tidak semua tipe button didukung WhatsApp — terutama kalau akun pengirim bukan WhatsApp Business:

- Tampil di akun biasa (non-Business): `quick_reply`, `cta_url`, `cta_copy`, `cta_call`, `single_select`
- Butuh akun WhatsApp Business: `cta_catalog`, `mpm`, `address_message`, `automated_greeting_message_view_catalog`
- Butuh fitur khusus (Flow, payment) dan umumnya tidak tampil: `send_location`, `open_webview`, `cta_reminder`, `cta_cancel_reminder`, `call_permission_request`, `wa_payment_transaction_details`, `galaxy_message`

Tipe yang tidak didukung akan muncul sebagai "pesan tidak dapat ditampilkan" di penerima — batasan dari WhatsApp, bukan versi aplikasi penerima. Balasan klik button masuk sebagai `interactiveResponseMessage` di `messages.upsert`. WhatsApp bisa mengubah dukungan dan formatnya kapan saja.

## Menerima Pesan

```js
sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return

  const msg = messages[0]
  if (!msg?.message || msg.key.fromMe) return

  const text = msg.message.conversation ?? msg.message.extendedTextMessage?.text
  console.log('Pesan masuk:', text, 'dari', msg.key.remoteJid)

  await sock.sendMessage(msg.key.remoteJid, { text: 'Pesan diterima!' })
})
```

## Catatan

- Package ini ESM — gunakan `import`, bukan `require`.
- Folder `auth_info` berisi kredensial login WhatsApp. Jangan di-commit atau dibagikan.
- Nama fungsi, event, dan tipe sama dengan Baileys — dokumentasi API lengkap: https://baileys.wiki

## Lisensi

MIT — lihat [LICENSE](LICENSE).
