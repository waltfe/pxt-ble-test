
/**
* Functions to BluetoothInteraction by ELECFREAKS Co.,Ltd.
*/
//% color=#00B1ED  icon="\uf005" block="BluetoothInteraction" blockId="BluetoothInteraction"
namespace BluetoothInteraction {

    let bleInitFlag: number = 0;
    let bleConnFalg: number = 0;
    let bleMsgState: number = 0;
    let bleHeaderBuf: number[] = [];
    let bleHeaderBufIndex: number = 0;
    let bleMsgBuf: number[] = [];
    let bleMsgBufIndex: number = 0;
    let bleCommandHandle: { [key: number]: (param: number[]) => number[] } = {};

    function handleBluetoothData(data: number) {
        switch (bleMsgState) {
            case 0:
                if (data == 0xFF) {
                    bleMsgBufIndex = 0;
                    bleHeaderBufIndex = 0;
                    bleMsgState = 1;
                }
                break;
            case 1:
                if (data == 0xF9) {
                    bleMsgState = 2;
                }
                break;
            case 2:
                bleHeaderBuf[bleHeaderBufIndex++] = data;
                if (bleHeaderBufIndex == 5) {
                    bleMsgState = 3;
                }
                break;
            case 3:
                bleMsgBuf[bleMsgBufIndex++] = data;
                if (bleHeaderBuf[4] == bleMsgBufIndex) {
                    bleMsgState = 4;
                }
                break;
            case 4:
                let checksum = 0xFF + 0xF9;
                for (let i = 0; i < bleHeaderBufIndex; i++) {
                    checksum += bleHeaderBuf[i];
                }
                for (let i = 0; i < bleMsgBufIndex; i++) {
                    checksum += bleMsgBuf[i];
                }
                // 指令校验通过，调用对应函数
                if (data == (checksum & 0xFF)) {
                    let bleMsgId = bleHeaderBuf[0] << 8 | bleHeaderBuf[1];
                    let bleMsgCode = bleHeaderBuf[2] << 8 | bleHeaderBuf[3];
                    handleBleCommand(bleMsgId, bleMsgCode, bleMsgBuf);
                }
                bleMsgState = 0;
                break;
            default:
                break;
        }
    }
    function sendBleResult(id: number, code: number, msg: number[]) {
        let buf = pins.createBuffer(8 + msg.length);
        buf[0] = 0xFF;
        buf[1] = 0xF9;
        buf[2] = (id >> 8) & 0xFF;
        buf[3] = id & 0xFF;
        buf[4] = (code >> 8) & 0xFF;
        buf[5] = code & 0xFF;
        buf[6] = msg.length;
        for (let i = 0; i < msg.length; i++) {
            buf[7 + i] = msg[i];
        }
        let checksum = 0;
        for (let i = 0; i < buf.length - 1; i++) {
            checksum += msg[i];
        }
        buf[buf.length - 1] = checksum & 0xFF;
        bluetooth.uartWriteBuffer(buf); // 向蓝牙设备写数据

    }

    function handleBleCommand(id: number, code: number, msg: number[]) {
        if (bleCommandHandle[code] != undefined) {
            let ret = bleCommandHandle[code](msg);
            if (ret != undefined) {
                sendBleResult(id, code, ret);
            }
        }
    }

    /**
     * CMD = 0x01
     * 翻转LED灯
     * @param msg[0] led x坐标
     * @param msg[1] led y坐标
     * @returns 返回1代表成功
     */
    function ledToggle(msg: number[]): number[] {
        led.toggle(msg[0], msg[1]);
        return [1];
    }

    /**
     * CMD = 0x02 
     * 读取超声波传检测到的距离
     * @param msg[0] RJ11接口编号[1-4]
     * @return [1] 距离高8位
     * @return [0] 距离低8位
     * @return 返回距离(厘米)，0表示无障碍物，检测范围2-430cm
     */
    function readUltrasonicSensor(msg: number[]): number[] {

        let Rjpin = msg[0];
        let pinT = DigitalPin.P1
        let pinE = DigitalPin.P2
        switch (Rjpin) {
            case 1:
                pinT = DigitalPin.P1
                pinE = DigitalPin.P8
                break;
            case 2:
                pinT = DigitalPin.P2
                pinE = DigitalPin.P12
                break;
            case 3:
                pinT = DigitalPin.P13
                pinE = DigitalPin.P14
                break;
            case 4:
                pinT = DigitalPin.P15
                pinE = DigitalPin.P16
                break;
        }
        pins.setPull(pinT, PinPullMode.PullNone)
        pins.digitalWritePin(pinT, 0)
        control.waitMicros(2)
        pins.digitalWritePin(pinT, 1)
        control.waitMicros(10)
        pins.digitalWritePin(pinT, 0)

        // read pulse
        let d = pins.pulseIn(pinE, PulseValue.High, 25000)
        let distance = d * 34 / 2 / 1000
        if (distance > 430) {
            distance = 0
        }
        distance = Math.floor(distance)
        return [(distance >> 8) & 0xFF, distance & 0xFF]  //cm
    }

    /**
     * CMD = 0x03
     * 读取光线传感器数值
     * @param msg[0] RJ11接口编号[1-4]
     * @return [1] 亮度值高8位
     * @return [0] 亮度值低8位
     * @return 亮度值(lux)
     */
    function readLightSensor(msg: number[]): number[] {
        let pin = (msg[0] == 1 ? AnalogPin.P1 : AnalogPin.P2)
        let voltage = 0;
        for (let index = 0; index < 200; index++) {
            voltage = voltage + pins.analogReadPin(pin)
            control.waitMicros(10)
        }

        voltage /= 200

        if (voltage < 200) {
            voltage = Math.map(voltage, 12, 180, 0, 1600)
        } else {
            voltage = Math.map(voltage, 181, 1023, 1601, 14000)
        }

        voltage = Math.round(Math.max(0, voltage))
        return [(voltage >> 8) & 0xFF, voltage & 0xFF]  //lux
    }


    /**
     * 初始化蓝牙模块
     */
    //% weight=99
    //% block="BluetoothInteraction Init"
    export function bluetoothServerInit() {
        if (bleInitFlag == 0) {
            basic.pause(100)
            bluetooth.startUartService()
            bluetooth.setTransmitPower(7)
            bluetooth.onBluetoothConnected(function () {
                bleConnFalg = 1;
            })
            bluetooth.onBluetoothDisconnected(function () {
                bleConnFalg = 0;
            })
            basic.forever(function () {
                if (bleConnFalg == 1) {
                    let buf = bluetooth.uartReadBuffer();
                    if (buf.length == 0) {
                        return;
                    }
                    for (let i = 0; i < buf.length; i++) {
                        handleBluetoothData(buf[i])
                    }
                }
            })

            bleCommandHandle[0x01] = ledToggle;
            bleCommandHandle[0x02] = readUltrasonicSensor;
            bleCommandHandle[0x03] = readLightSensor;
            bleInitFlag = 1;
        }
    }
}