process.env.VUE_ENV = 'server'
const isProd = process.env.NODE_ENV === 'production'

const fs = require('fs')
const path = require('path')
const resolve = file => path.resolve(__dirname, file)
const express = require('express')
const favicon = require('serve-favicon')
const serialize = require('serialize-javascript')

const createBundleRenderer = require('vue-server-renderer').createBundleRenderer

const app = express()

// parse index.html template
const html = (() => {
  const template = fs.readFileSync(resolve('./index.html'), 'utf-8')
  const i = template.indexOf('{{ APP }}')
  // styles are injected dynamically via vue-style-loader in development
  const style = isProd ? '<link rel="stylesheet" href="/dist/styles.css">' : ''
  return {
    head: template.slice(0, i).replace('{{ STYLE }}', style),
    tail: template.slice(i + '{{ APP }}'.length)
  }
})()

let renderer
if (isProd) {
  // create server renderer from real fs
  const bundlePath = resolve('./dist/server-bundle.js')
  renderer = createRenderer(fs.readFileSync(bundlePath, 'utf-8'))
} else {
  require('./build/dev-server')(app, bundle => {
    renderer = createRenderer(bundle)
  })
}

function createRenderer(bundle) {
  return createBundleRenderer(bundle, {
    cache: require('lru-cache')({
      max: 1000,
      maxAge: 1000 * 60 * 15
    })
  })
}

app.use('/dist', express.static(resolve('./dist')))
app.use(favicon(path.resolve(__dirname, 'src/assets/logo.png')))

// app.get('*', (req, res) => {
//   if (!renderer) {
//     return res.end('waiting for compilation... refresh in a moment.')
//   }
//
//   var s = Date.now()
//   const context = { url: req.url }
//   const renderStream = renderer.renderToStream(context)
//   let firstChunk = true
//
//   res.write(html.head)
//
//   renderStream.on('data', chunk => {
//     if (firstChunk) {
//       // embed initial store state
//       if (context.initialState) {
//         res.write(
//           `<script>window.__INITIAL_STATE__=${
//             serialize(context.initialState, { isJSON: true })
//           }</script>`
//         )
//       }
//       firstChunk = false
//     }
//     res.write(chunk)
//   })
//
//   renderStream.on('end', () => {
//     res.end(html.tail)
//     console.log(`whole request: ${Date.now() - s}ms`)
//   })
//
//   renderStream.on('error', err => {
//     throw err
//   })
// })

app.get('*', (req, res) => {
    if (!renderer) {
    return res.end('waiting for compilation... refresh in a moment.')
  }
  const context = {url: req.url}
  const renderStream = renderer.renderToStream(context)
  const styles = isProd ? '<link rel="stylesheet" href="/dist/styles.css">' : ''
  renderStream.once('data', () => {
    const {
      title, htmlAttrs, bodyAttrs, link, style, script, noscript, meta
    } = context.meta.inject()
    res.write(`
      <!DOCTYPE html>
      <html ang="ru" data-vue-meta-server-rendered ${htmlAttrs.text()}>
        <head>
          ${meta.text()}
          ${title.text()}
          ${link.text()}
          ${style.text()}
          ${script.text()}
          ${noscript.text()}
          ${styles}
        </head>
        <body ${bodyAttrs.text()}>
    `)
  })
  renderStream.on('data', (chunk) => {
    res.write(chunk)
  })
  const s = Date.now()
  renderStream.on('end', () => {
    res.end(`
          <script src="/dist/client-vendor-bundle.js"></script>
          <script src="/dist/client-bundle.js"></script>
        </body>
      </html>
    `)
  })
  renderStream.on('error', (error) => res.status(500).end(`<pre>${error.stack}</pre>`))
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`server started at http://localhost:${port}`)
})
