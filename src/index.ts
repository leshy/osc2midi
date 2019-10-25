// import * as os from 'os'
import _ from 'lodash'

// @ts-ignore
import * as easyMidi from 'easymidi'
// @ts-ignore
import * as mdns from 'mdns'
import { createLogger, format, transports } from 'winston'
import { consoleFormat } from 'winston-console-format'

// @ts-ignore
import * as osc from 'osc'

const argv = _.pick(
  require('yargs')
    .count('verbose')
    .alias('v', 'verbose')
    .alias('z', 'zeroconf')
    .alias('p', 'port')
    .help('h')
    .alias('h', 'help').argv,
  ['verbose', 'zeroconf', 'port'],
)

const defaultConf = {
  port: 8181,
  verbose: 1,
  zeroconf: false,
}

const conf = { ...defaultConf, ...argv }

const verbose2level = (verbose: number | void) => {
  if (!verbose) {
    return 'warning'
  }
  if (verbose === 1) {
    return 'info'
  }
  if (verbose === 2) {
    return 'verbose'
  }

  return 'debug'
}

const rootLogger = createLogger({
  level: verbose2level(conf.verbose),
  format: format.combine(
    format.timestamp(),
    // format.ms(),
    format.errors({ stack: true }),
    format.splat(),
    format.json(),
  ),
  defaultMeta: { service: 'osc2midi' },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize({ all: true }),
        format.padLevels(),
        consoleFormat({
          showMeta: true,
          metaStrip: ['timestamp', 'service'],
          inspectOptions: {
            depth: 8,
            colors: true,
            maxArrayLength: 20,
            breakLength: 120,
            compact: Infinity,
          },
        }),
      ),
    }),
  ],
})

rootLogger.verbose(`log level ${verbose2level(conf.verbose).toUpperCase()}`)
rootLogger.info('configuration', conf)

if (conf.zeroconf) {
  const logger = rootLogger.child({ service: 'zeroconf' })

  const ad = mdns.createAdvertisement(mdns.udp('osc'), conf.port)
  ad.start()

  logger.verbose('Zeroconf broadcasting')
}

var udpPort = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: conf.port,
  metadata: true,
})

udpPort.open()

// @ts-ignore
var midiOut = new easyMidi.Output('osc2midi', true)

const resolveAddress = (address: string): number =>
  Number(address[address.length - 1])

// @ts-ignore
udpPort.on('message', function(oscMsg) {
  rootLogger.debug('OSC', oscMsg)
  const { address, args } = oscMsg
  const midiMsg = {
    controller: resolveAddress(address),
    value: Math.round(128 * args[0].value),
    channel: 0,
  }
  rootLogger.debug('MIDI', midiMsg)

  midiOut.send('cc', midiMsg)
})

udpPort.on('ready', function() {
  rootLogger.info(`OSC listening on UDP ${conf.port}`)
})
