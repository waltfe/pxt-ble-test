
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

    let timeout:number = 0
    let __temperature: number = 0
    let __humidity: number = 0

    //NFC模块配置参数
    let NFC_I2C_ADDR = (0x48 >> 1);
    let recvBuf = pins.createBuffer(32);
    let recvAck = pins.createBuffer(8);
    let ackBuf = pins.createBuffer(6);
    let uId = pins.createBuffer(4);
    let passwdBuf = pins.createBuffer(6);
    let blockData = pins.createBuffer(16);
    let NFC_ENABLE = 0;
    const block_def = 1;
    ackBuf[0] = 0x00;
    ackBuf[1] = 0x00;
    ackBuf[2] = 0xFF;
    ackBuf[3] = 0x00;
    ackBuf[4] = 0xFF;
    ackBuf[5] = 0x00;
    passwdBuf[0] = 0xFF;
    passwdBuf[1] = 0xFF;
    passwdBuf[2] = 0xFF;
    passwdBuf[3] = 0xFF;
    passwdBuf[4] = 0xFF;
    passwdBuf[5] = 0xFF;

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

    function checkDcs(len: number): boolean {
        let sum = 0, dcs = 0;
        for (let i = 1; i < len - 2; i++) {
            if ((i === 4) || (i === 5)) {
                continue;
            }
            sum += recvBuf[i];
        }
        dcs = 0xFF - (sum & 0xFF);
        if (dcs != recvBuf[len - 2]) {
            return false;
        }
        return true;
    }
    function passwdCheck(id: Buffer, st: Buffer): boolean {
        let buf: number[] = [];
        buf = [0x00, 0x00, 0xFF, 0x0F, 0xF1, 0xD4, 0x40, 0x01, 0x60, 0x07, 0xFF,
            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xD1, 0xAA, 0x40, 0xEA, 0xC2, 0x00];
        let cmdPassWord = pins.createBufferFromArray(buf);
        let sum = 0, count = 0;
        cmdPassWord[9] = block_def;
        for (let i = 10; i < 16; i++)
            cmdPassWord[i] = st[i - 10];
        for (let i = 16; i < 20; i++)
            cmdPassWord[i] = id[i - 16];
        for (let i = 0; i < 20; i++) {
            if (i === 3 || i === 4) {
                continue;
            }
            sum += cmdPassWord[i];
        }
        cmdPassWord[20] = 0xff - (sum & 0xff)
        writeAndReadBuf(cmdPassWord, 15);
        for (let i = 0; i < 4; i++) {
            if (recvAck[1 + i] != ackBuf[i]) {
                serial.writeLine("psd ack ERROR!");
                return false;
            }
        }
        if ((recvBuf[6] === 0xD5) && (recvBuf[7] === 0x41) && (recvBuf[8] === 0x00) && (checkDcs(15 - 4))) {
            return true;
        }
        return false;
    }

    function writeAndReadBuf(buf: Buffer, len: number) {
        pins.i2cWriteBuffer(NFC_I2C_ADDR, buf);
        basic.pause(100);
        recvAck = pins.i2cReadBuffer(NFC_I2C_ADDR, 8);
        basic.pause(100);
        recvBuf = pins.i2cReadBuffer(NFC_I2C_ADDR, len - 4);
    }

    function wakeup() {
        basic.pause(100);
        let i = 0;
        let buf: number[] = [];
        buf = [0x00, 0x00, 0xFF, 0x05, 0xFB, 0xD4, 0x14, 0x01, 0x14, 0x01, 0x02, 0x00];
        let cmdWake = pins.createBufferFromArray(buf);
        writeAndReadBuf(cmdWake, 14);
        for (i = 0; i < ackBuf.length; i++) {
            if (recvAck[1 + i] != ackBuf[i]) {
                break;
            }
        }
        if ((i != ackBuf.length) || (recvBuf[6] != 0xD5) || (recvBuf[7] != 0x15) || (!checkDcs(14 - 4))) {
            NFC_ENABLE = 0;
        } else {
            NFC_ENABLE = 1;
        }
        basic.pause(100);
    }

    function writeblock(data: Buffer): void {
        if (!passwdCheck(uId, passwdBuf))
            return;
        let cmdWrite: number[] = [0x00, 0x00, 0xff, 0x15, 0xEB, 0xD4, 0x40, 0x01, 0xA0,
            0x06, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
            0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0xCD,
            0x00];
        let sum = 0, count = 0;
        cmdWrite[9] = block_def;
        for (let i = 10; i < 26; i++)
            cmdWrite[i] = data[i - 10];
        for (let i = 0; i < 26; i++) {
            if ((i === 3) || (i === 4)) {
                continue;
            }
            sum += cmdWrite[i];
        }
        cmdWrite[26] = 0xff - (sum & 0xff);
        let tempbuf = pins.createBufferFromArray(cmdWrite)
        writeAndReadBuf(tempbuf, 16);
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
     * @param msg[0] RJ11接口编号[1-2]
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
     * @param msg[0] RJ11接口编号[1-2]
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
     * CMD = 0x04
     * 读取噪音传感器数值
     * @param msg[0] RJ11接口编号[1-2]
     * @return [0] 噪音值 0-120
     */
    function readNoiseSensor(msg: number[]): number[] {
        let pin = (msg[0] == 1 ? AnalogPin.P1 : AnalogPin.P2)
        let level = 0, voltage = 0, noise = 0, h = 0, l = 0, sumh = 0, suml = 0
        for (let i = 0; i < 1000; i++) {
            level = level + pins.analogReadPin(pin)
        }
        level = level / 1000
        for (let i = 0; i < 1000; i++) {
            voltage = pins.analogReadPin(pin)
            if (voltage >= level) {
                h += 1
                sumh = sumh + voltage
            } else {
                l += 1
                suml = suml + voltage
            }
        }
        if (h == 0) {
            sumh = level
        } else {
            sumh = sumh / h
        }
        if (l == 0) {
            suml = level
        } else {
            suml = suml / l
        }
        noise = sumh - suml
        if (noise <= 4) {
            noise = pins.map(
                noise,
                0,
                4,
                30,
                50
            )
        } else if (noise <= 8) {
            noise = pins.map(
                noise,
                4,
                8,
                50,
                55
            )
        } else if (noise <= 14) {
            noise = pins.map(
                noise,
                9,
                14,
                55,
                60
            )
        } else if (noise <= 32) {
            noise = pins.map(
                noise,
                15,
                32,
                60,
                70
            )
        } else if (noise <= 60) {
            noise = pins.map(
                noise,
                33,
                60,
                70,
                75
            )
        } else if (noise <= 100) {
            noise = pins.map(
                noise,
                61,
                100,
                75,
                80
            )
        } else if (noise <= 150) {
            noise = pins.map(
                noise,
                101,
                150,
                80,
                85
            )
        } else if (noise <= 231) {
            noise = pins.map(
                noise,
                151,
                231,
                85,
                90
            )
        } else {
            noise = pins.map(
                noise,
                231,
                1023,
                90,
                120
            )
        }
        return [Math.round(noise)]
    }

    /**
     * CMD = 0x05
     * 读取土壤湿度传感器数值
     * @param msg[0] RJ11接口编号[1-2]
     * @return [0] 土壤湿度值 0-100
     */
    function readSoilHumiditySensor(msg: number[]): number[] {
        let pin = (msg[0] == 1 ? AnalogPin.P1 : AnalogPin.P2)
        let voltage = 0, soilmoisture = 0;
        voltage = pins.map(
            pins.analogReadPin(pin),
            0,
            1023,
            0,
            100
        );
        soilmoisture = 100 - voltage;
        return [Math.round(soilmoisture)]
    }

    /**
     * CMD = 0x06
     * 读取温湿度传感器数值
     * @param msg[0] RJ11接口编号[1-4]
     * @return [0] 温度值 -40~85
     * @return [1] 湿度值 0-100
     */
    function readDht11Sensor(msg: number[]): number[] {
        //initialize
        if (input.runningTime() >= timeout)
        {
            timeout = input.runningTime() + 2000
        }
        else
        {
            return [__temperature, __humidity]
        }

        let timeout_flag: number = 0
        let _temperature: number = -999.0
        let _humidity: number = -999.0
        let checksum: number = 0
        let checksumTmp: number = 0
        let dataArray: boolean[] = []
        let resultArray: number[] = []
        let pin = DigitalPin.P1
        switch (msg[0]) {
            case 1:
                pin = DigitalPin.P8
                break;
            case 2:
                pin = DigitalPin.P12
                break;
            case 3:
                pin = DigitalPin.P14
                break;
            case 4:
                pin = DigitalPin.P16
                break;
         }
        let i: number = 0
        for (i = 0; i < 1; i++) {
            for (let index = 0; index < 40; index++) dataArray.push(false)
            for (let index = 0; index < 5; index++) resultArray.push(0)
            pins.setPull(pin, PinPullMode.PullUp)
            pins.digitalWritePin(pin, 0) //begin protocol, pull down pin
            basic.pause(18)
            pins.digitalWritePin(pin, 1) //pull up pin for 18us
            pins.digitalReadPin(pin) //pull up pin
            control.waitMicros(40)
            if (!(waitDigitalReadPin(1, 9999, pin))) continue;
            if (!(waitDigitalReadPin(0, 9999, pin))) continue;
            //read data (5 bytes)

            for (let index = 0; index < 40; index++) {
                if (!(waitDigitalReadPin(0, 9999, pin))) {
                    timeout_flag = 1
                    break;
                }
                if (!(waitDigitalReadPin(1, 9999, pin))) {
                    timeout_flag = 1
                    break;
                }
                control.waitMicros(40)
                //if sensor still pull up data pin after 28 us it means 1, otherwise 0
                if (pins.digitalReadPin(pin) == 1) dataArray[index] = true
            }

            //convert byte number array to integer
            for (let index = 0; index < 5; index++)
                for (let index2 = 0; index2 < 8; index2++)
                    if (dataArray[8 * index + index2]) resultArray[index] += 2 ** (7 - index2)
            //verify checksum
            checksumTmp = resultArray[0] + resultArray[1] + resultArray[2] + resultArray[3]
            checksum = resultArray[4]
            if (checksumTmp >= 512) checksumTmp -= 512
            if (checksumTmp >= 256) checksumTmp -= 256
            if (checksumTmp == checksum){
                __temperature = resultArray[2] + resultArray[3] / 100
                __humidity = resultArray[0] + resultArray[1] / 100
                break;
            }
        }
        return [__temperature, __humidity]
    }

    /**
     * CMD = 0x07
     * 读取PIR传感器数值
     * @param msg[0] RJ11接口编号[1-4]
     * @return [0] 运动检测结果[1:检测到运动,0:未检测到运动]
     */
    function readPIRSensor(msg: number[]): number[] {
        //initialize
        let pin = DigitalPin.P1
        switch (msg[0]) {
            case 1:
                pin = DigitalPin.P8
                break;
            case 2:
                pin = DigitalPin.P12
                break;
            case 3:
                pin = DigitalPin.P14
                break;
            case 4:
                pin = DigitalPin.P16
                break;
        }
        return [pins.digitalReadPin(pin) == 1? 1 : 0]
    }

    /**
     * CMD = 0x08
     * 读取按钮CD传感器数值
     * @param msg[0] RJ11接口编号[1-4]
     * @return [0] 按钮C按下状态[0:按下,1:未按下] 
     * @return [1] 按钮D按下状态[0:按下,1:未按下]
     */
    function readButtonCDSensor(msg: number[]): number[] {
        //initialize
        let pinC = DigitalPin.P1
        let pinD = DigitalPin.P2
        switch (msg[0]) {
            case 1:
                pinC = DigitalPin.P1
                pinD = DigitalPin.P8
                break;
            case 2:
                pinC = DigitalPin.P2
                pinD = DigitalPin.P12
                break;
            case 3:
                pinC = DigitalPin.P13
                pinD = DigitalPin.P14
                break;
            case 4:
                pinC = DigitalPin.P15
                pinD = DigitalPin.P16
                break;
        }
        pins.setPull(pinC, PinPullMode.PullUp)
        pins.setPull(pinD, PinPullMode.PullUp)
        return [pins.digitalReadPin(pinC), pins.digitalReadPin(pinD)] 
    }

    /**
     * CMD = 0x09
     * 读取RFID传感器是否检测到卡片
     */
    function RFIDreadCheckCard(): number[] {
        //initialize
        if (NFC_ENABLE === 0) {
            wakeup();
        }
        let buf: number[] = [];
        buf = [0x00, 0x00, 0xFF, 0x04, 0xFC, 0xD4, 0x4A, 0x01, 0x00, 0xE1, 0x00];
        let cmdUid = pins.createBufferFromArray(buf);
        writeAndReadBuf(cmdUid, 24);
        for (let i = 0; i < 4; i++) {
            if (recvAck[1 + i] != ackBuf[i]) {
                return [0];
            }
        }
        if ((recvBuf[6] != 0xD5) || (!checkDcs(24 - 4))) {
            return [0];
        }
        for (let i = 0; i < uId.length; i++) {
            uId[i] = recvBuf[14 + i];
        }
        if (uId[0] === uId[1] && uId[1] === uId[2] && uId[2] === uId[3] && uId[3] === 0xFF) {
            return [0];
        }
        return [1];
    }

    /**
     * CMD = 0x0A
     * 读取RFID传感器检测到的卡片的数据
     * @return [0] and lenth等于1 0:读取成功,1:密码错误,2:读取失败
     * @return [0-15] and lenth等于16 读取到的数据
     */
    function RFIDreadDataBlock(): number[] {
        //initialize
        if (NFC_ENABLE === 0) {
            wakeup();
        }
        let checkCardResult = RFIDreadCheckCard();
        if (checkCardResult[0] === 0) {
            serial.writeLine("No NFC Card!")
            return [0]
        }
        if (!passwdCheck(uId, passwdBuf)) {
            serial.writeLine("passwd error!")
            return [1];
        }
        let cmdRead: number[] = []
        cmdRead = [0x00, 0x00, 0xff, 0x05, 0xfb, 0xD4, 0x40, 0x01, 0x30, 0x07, 0xB4, 0x00];
        let sum = 0, count = 0;
        cmdRead[9] = block_def;
        for (let i = 0; i < cmdRead.length - 2; i++) {
            if ((i === 3) || (i === 4)) {
                continue;
            }
            sum += cmdRead[i];
        }
        cmdRead[cmdRead.length - 2] = 0xff - sum & 0xff;
        let buf = pins.createBufferFromArray(cmdRead)
        writeAndReadBuf(buf, 31);
        let ret: number[]
        if ((recvBuf[6] === 0xD5) && (recvBuf[7] === 0x41) && (recvBuf[8] === 0x00) && (checkDcs(31 - 4))) {
            for (let i = 0; i < 16; i++) {
                if (recvBuf[i + 9] >= 0x20 && recvBuf[i + 9] < 0x7f) {
                    ret[i] = recvBuf[i + 9] // valid ascii
                }
            }
            return ret;
        }
        return [2]
    }

    /**
     * CMD = 0x0B
     * 读取RFID传感器检测到的卡片的数据
     */
    function RFIDWriteData(msg: number[]): number[] {
        let data:Buffer = pins.createBuffer(16)
        //initialize
        for (let i = 0; i < msg.length; i++) {
            data[i] = msg[i]
        }

        let len = data.length
        if (len > 16) {
            len = 16
        }
        for (let i = 0; i < len; i++) {
            blockData[i] = data.charCodeAt(i)
        }
        writeblock(blockData);
        return [1]
    }

    /**
     * CMD = 0x99
     * 语音控制演示功能
     * @param msg[0] 控制指令
     * @returns 返回1代表成功
     */
    function audioControl(msg: number[]): number[] {
        let buf = pins.createBuffer(8)
        buf[0] = 0xFF;
        buf[1] = 0xF9;
        buf[2] = 0x01;
        buf[3] = 0x01;
        buf[4] = 0x60;
        buf[6] = 0xF5;
        buf[7] = 0x00;
        switch (msg[0]) {
            case 1:
                pins.analogSetPeriod(AnalogPin.P1, 100)
                pins.analogWritePin(AnalogPin.P1, 500)
                break;
            case 2:
                pins.analogSetPeriod(AnalogPin.P1, 100)
                pins.analogWritePin(AnalogPin.P1, 0)
                break;
            case 3:
                buf[5] = 100;
                pins.i2cWriteBuffer(0x10, buf);
                break;
            case 4:
                buf[6] = 0;
                pins.i2cWriteBuffer(0x10, buf);
                break;
            case 5:
                pins.analogSetPeriod(AnalogPin.P2, 100)
                pins.analogWritePin(AnalogPin.P2, 500)
                break;
            case 6:
                pins.analogSetPeriod(AnalogPin.P2, 100)
                pins.analogWritePin(AnalogPin.P2, 0)
                break;
        }
        return [1];
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
            bleCommandHandle[0x04] = readNoiseSensor;
            bleCommandHandle[0x05] = readSoilHumiditySensor;
            bleCommandHandle[0x06] = readDht11Sensor;
            bleCommandHandle[0x07] = readPIRSensor; 
            bleCommandHandle[0x08] = readButtonCDSensor;
            bleCommandHandle[0x09] = RFIDreadCheckCard;
            bleCommandHandle[0x0A] = RFIDreadDataBlock;
            bleCommandHandle[0x0B] = RFIDWriteData;
            // bleCommandHandle[0x99] = audioControl;
            bleInitFlag = 1;
        }
    }
}