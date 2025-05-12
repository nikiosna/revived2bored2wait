const minecraftProtocol = require('minecraft-protocol')
const bufferEqual = require('buffer-equal')
const connectionStates = minecraftProtocol.states

// Configuration
const proxyConfig = {
  proxyPort: 25566,
  targetHost: '127.0.0.1',
  targetPort: 25565,
  version: '1.20.6',
  printAllPackets: true,
  // Add specific packets to whitelist (will print even if printAllPackets is false)
  printWhitelist: {
    // Example: "open_window": "io"
  },
  // Add packets to blacklist (won't print even if printAllPackets is true)
  printBlacklist: {
    // Common high-frequency packets you might want to blacklist:
    //"keep_alive": "io",
    //"update_time": "io",
    //"entity_velocity": "io",
    //"rel_entity_move": "io",
    //"entity_look": "io",
    //"entity_move_look": "io",
    //"entity_teleport": "io",
    //"entity_head_rotation": "io",
    //"position": "io"
  }
}

// Create proxy server
const proxyServer = minecraftProtocol.createServer({
  'online-mode': false,
  port: proxyConfig.proxyPort,
  keepAlive: false,
  version: proxyConfig.version
})

proxyServer.playerCount = 0
proxyServer.maxPlayers = 1

proxyServer.on('login', function (clientConnection) {
  const clientAddress = clientConnection.socket.remoteAddress
  console.log('Incoming connection', '(' + clientAddress + ')')

  let clientDisconnected = false
  let serverDisconnected = false

  clientConnection.on('end', function () {
    clientDisconnected = true
    console.log('Connection closed by client', '(' + clientAddress + ')')
    if (!serverDisconnected) { serverConnection.end('End') }
  })

  clientConnection.on('error', function (err) {
    clientDisconnected = true
    console.log('Connection error by client', '(' + clientAddress + ')')
    console.log(err.stack)
    if (!serverDisconnected) { serverConnection.end('Error') }
  })

  const serverConnection = minecraftProtocol.createClient({
    host: proxyConfig.targetHost,
    port: proxyConfig.targetPort,
    username: clientConnection.username,
    auth: "microsoft",
    keepAlive: false,
    version: proxyConfig.version,
    profilesFolder: "./auth/"
  })

  clientConnection.on('packet', function (packetData, packetMeta) {
    if (serverConnection.state !== connectionStates.PLAY || packetMeta.state !== connectionStates.PLAY) { return }
    if (shouldLogPacket(packetMeta.name, 'o')) {
      console.log('client->server:',
        clientConnection.state + ' ' + packetMeta.name + ' :',
        JSON.stringify(packetData))
    }
    if (!serverDisconnected) {
      serverConnection.write(packetMeta.name, packetData)
    }
  })

  serverConnection.on('packet', function (packetData, packetMeta) {
    if (packetMeta.state !== connectionStates.PLAY || clientConnection.state !== connectionStates.PLAY) { return }
    if (shouldLogPacket(packetMeta.name, 'i')) {
      console.log('client<-server:',
        serverConnection.state + '.' + packetMeta.name + ' :' +
        JSON.stringify(packetData))
    }
    if (!clientDisconnected) {
      clientConnection.write(packetMeta.name, packetData)
      if (packetMeta.name === 'set_compression') {
        clientConnection.compressionThreshold = packetData.threshold
      }
    }
  })

  /*serverConnection.on('raw', function (buffer, packetMeta) {
    //if (clientConnection.state !== connectionStates.PLAY || packetMeta.state !== connectionStates.PLAY) { return }
    const packetData = serverConnection.deserializer.parsePacketBuffer(buffer).data.params
    const packetBuffer = clientConnection.serializer.createPacketBuffer({ name: packetMeta.name, params: packetData })
    if (!bufferEqual(buffer, packetBuffer)) {
      console.log('client<-server: Error in packet ' + packetMeta.state + '.' + packetMeta.name)
      console.log('received buffer', buffer.toString('hex'))
      console.log('produced buffer', packetBuffer.toString('hex'))
      console.log('received length', buffer.length)
      console.log('produced length', packetBuffer.length)
    }
  })

  clientConnection.on('raw', function (buffer, packetMeta) {
    //if (packetMeta.state !== connectionStates.PLAY || serverConnection.state !== connectionStates.PLAY) { return }
    const packetData = clientConnection.deserializer.parsePacketBuffer(buffer).data.params
    const packetBuffer = serverConnection.serializer.createPacketBuffer({ name: packetMeta.name, params: packetData })
    if (!bufferEqual(buffer, packetBuffer)) {
      console.log('client->server: Error in packet ' + packetMeta.state + '.' + packetMeta.name)
      console.log('received buffer', buffer.toString('hex'))
      console.log('produced buffer', packetBuffer.toString('hex'))
      console.log('received length', buffer.length)
      console.log('produced length', packetBuffer.length)
    }
  })*/

  serverConnection.on('end', function () {
    serverDisconnected = true
    console.log('Connection closed by server', '(' + clientAddress + ')')
    if (!clientDisconnected) { clientConnection.end('End') }
  })

  serverConnection.on('error', function (err) {
    serverDisconnected = true
    console.log('Connection error by server', '(' + clientAddress + ') ', err)
    console.log(err.stack)
    if (!clientDisconnected) { clientConnection.end('Error') }
  })
})

function shouldLogPacket(packetName, direction) {
  if (isPacketInList(proxyConfig.printBlacklist[packetName])) return false
  if (proxyConfig.printAllPackets) return true
  return isPacketInList(proxyConfig.printWhitelist[packetName])

  function isPacketInList(result) {
    return result !== undefined && result !== null && result.indexOf(direction) !== -1
  }
}

console.log(`Minecraft protocol proxy running on port ${proxyConfig.proxyPort}`)
console.log(`Targeting server at ${proxyConfig.targetHost}:${proxyConfig.targetPort} with version ${proxyConfig.version}`)