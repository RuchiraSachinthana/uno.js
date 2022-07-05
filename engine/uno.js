// pin mode constants
const OUTPUT = 0
const INPUT = 1

// volt level constants
const HIGH = 1
const LOW = 0

// main class
const UNO = class {
    
    constructor() {

        // port object
        let port = null
        // running state flag
        let running = false
        // supported versions
        const versions = ['1.0.22']

        // init method
        this.init = async function() {
            return new Promise(resolve => {
                // request usb port
                navigator.serial.requestPort().then(portObject => {
                    // store port object
                    port = portObject
                    // opening port
                    port.open({ baudRate : 2000000 }).then(() => {
                        // get reader and writer
                        send.reader = port.readable.getReader()
                        send.writer = port.writable.getWriter()
                        // success request delay 
                        setTimeout(() => {
                            // request client version
                            getVersion().then(ver => {
                                if(versions.includes(ver)) {
                                    // set running flag
                                    running = true
                                    // callback resolve
                                    resolve()
                                } else {
                                    // version not supported
                                    console.log('Please update the UNO.js Client.')
                                }
                            })
                        }, 3000)
                    })
                })
            })
        }

        // pin states
        const states = { digital : [], analog : [] }

        // sender busy state
        let busy = false

        // first state flag
        let first = true

        const types = [ 201, 202, 203, 204, 205, 206, 207, 208, 209, 210 ]

        const send = async function(type, resolve, reject, data = []) {
            // return if busy
            if(busy) { return reject() }
            // set busy flag
            busy = true
            // create array for buffer
            const array = [type].concat(data)
            // push end character
            array.push(255)
            // send message as buffer
            send.writer.write(new Uint8Array(array)).then(() => {
                // bytes remainder
                let remainder = []
                // read loop until end character
                const readLoop = () => {
                    // read message
                    send.reader.read().then(obj => {
                        // get received bytes
                        const arr = Array.from(obj.value)
                        // combine with remainder
                        remainder = remainder.concat(arr)
                        // clear garbage in remainder
                        remainder = readClear(remainder)
                        // get end character index
                        const end = remainder.indexOf(255)
                        // callback for completed message
                        if(end > -1) {
                            // get message from remainder
                            const data = remainder.splice(0, end)
                            // resolve callback
                            sendResolve(data, resolve)
                            // release busy flag
                            busy = false
                        } else {
                            // read loop again
                            readLoop()
                        }
                    }).catch(reject)
                }
                // read clear method for garbage
                const readClear = arr => {
                    // no message type in front byte
                    if(types.includes(arr[0]) === false) {
                        // check for end character
                        if(arr.includes(255)) {
                            // splice from end
                            arr.splice(0, arr.lastIndexOf(255) + 1)
                        } else if(arr.length > 1) {
                            // clear all due to garbage
                            arr = []
                        }
                    }
                    // first call check
                    if(first === true && arr[0] !== 201 && arr[arr.length - 1] === 255) {
                        // clear array
                        arr = []
                    }
                    // update flag
                    first = false
                    // return remainder
                    return arr
                }
                // start read loop
                readLoop()
            }).catch(reject)
        }

        const sendResolve = (data, resolve) => {
            // remove message type
            data.shift()
            // get digital states
            const digital = data.splice(0, data.indexOf(254) + 1)
            // get analog states
            const analog = data.splice(0, data.indexOf(254) + 1).map(x => parseInt(x * 5.115))
            // update digital pins
            states.digital = digital.splice(0, digital.length - 1)
            // update analog pins
            states.analog = analog.splice(0, analog.length - 1)
            // callback resolve after updaing pin states
            resolve(data)
        }

        // get version method
        const getVersion = async function() {
            return new Promise((resolve, reject) => {
                send(201, arr => {
                    resolve(arr.splice(0, 3).join('.'))
                }, reject)
            })
        }

        // update pin states method
        this.update = async function() {
            // return promise
            return new Promise((resolve, reject) => {
                send(203, resolve, reject, [])
            })
        }

        // digital read method
        this.digitalRead = pin => {
            return states.digital[pin]
        }

        // analog read method
        this.analogRead = pin => {
            return states.analog[pin]
        }

        // pin format converter
        const convertPinFormat = (args, par_1, par_2) => {
            // data object
            let data = typeof args[0] === 'object' ? args[0] : {}
            // check input mode
            if(args.length === 1) {
                // object mode
                if(data[par_1] === undefined) { data[par_1] = [] }
                if(data[par_2] === undefined) { data[par_2] = [] }
            } else {
                // single mode
                if(args[1] === 1) {
                    data[par_1] = [ args[0] ]
                    data[par_2] = []
                } else {
                    data[par_2] = [ args[0] ]
                    data[par_1] = []
                }
            }
            // output array
            const out = []
            // push other pins
            for(let i = 0; i < states.digital.length; i++) {
                if(data[par_1].includes(i)) {
                    // set as input, high pin
                    out.push(1)
                } else if(data[par_2].includes(i)) {
                    // set as output, low pin
                    out.push(0)
                } else {
                    // no change to pin
                    out.push(253)
                }
            }
            // return output
            return out
        }

        // analog pin conveter method
        const convertPinFormatAnalog = args => {
            // data object
            let data = typeof args[0] === 'object' ? args[0] : {}
            // check arguments length
            if(args.length === 2) {
                data[args[0]] = args[1]
            }
            // output array
            const out = []
            // get keys array
            const krr = Object.keys(data).map(x => parseInt(x))
            // push other pins
            for(let i = 0; i < states.digital.length; i++) {
                if(krr.includes(i)) {
                    // analog value in range 0  to 255 => 0 to 200
                    out.push(parseInt((data[i] > 255 ? 255 : data[i]) / 1.275))
                } else {
                    // no change to pin
                    out.push(253)
                }
            }
            // return output
            return out
        }

        // set pin mode method
        this.pinMode = async function() {
            // get pin format
            const data = convertPinFormat(arguments, 'INPUT', 'OUTPUT')
            // return promise
            return new Promise((resolve, reject) => {
                send(202, resolve, reject, data)
            })
        }

        // digital write method
        this.digitalWrite = async function() {
            // get pin format
            const data = convertPinFormat(arguments, 'HIGH', 'LOW')
            // return promise
            return new Promise((resolve, reject) => {
                send(204, resolve, reject, data)
            })
        }

        // digital write method
        this.analogWrite = async function() {
            // get pin format
            const data = convertPinFormatAnalog(arguments)
            // return promise
            return new Promise((resolve, reject) => {
                send(205, resolve, reject, data)
            })
        }

        const encoder = new TextEncoder()
        const decoder = new TextDecoder()

        // delay method
        this.delay = async function(milliseconds) {
            // time input to buffer
            const data = Array.from(encoder.encode(milliseconds))
            // return promise
            return new Promise((resolve, reject) => {
                send(206, resolve, reject, data)
            })
        }

        // delay method
        this.delayMicroseconds = async function(microseconds) {
            // time input to buffer
            const data = Array.from(encoder.encode(microseconds))
            // return promise
            return new Promise((resolve, reject) => {
                send(207, resolve, reject, data)
            })
        }

        // millis method
        this.millis = async function() {
            // return promise
            return new Promise((resolve, reject) => {
                send(208, arr => {
                    // remove last char
                    arr.pop()
                    // decode and resolve
                    resolve(parseInt(decoder.decode(new Uint8Array(arr))))
                }, reject, [])
            })
        }

        // micros method
        this.micros = async function() {
            // return promise
            return new Promise((resolve, reject) => {
                send(209, arr => {
                    // remove last char
                    arr.pop()
                    // decode and resolve
                    resolve(parseInt(decoder.decode(new Uint8Array(arr))))
                }, reject, [])
            })
        }

        // pulse in method
        this.pulseIn = async function(pin, value) {
            // return promise
            return new Promise((resolve, reject) => {
                send(210, arr => {
                    // remove last char
                    arr.pop()
                    console.log(arr)
                    resolve(parseInt(decoder.decode(new Uint8Array(arr))))
                }, reject, [pin, value])
            })
        }

    }

}