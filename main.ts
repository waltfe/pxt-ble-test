
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
        for (let i = 0; i < msg.length - 1; i++) {
            checksum += msg[i];
        }
        buf[msg.length - 1] = checksum & 0xFF;
        bluetooth.uartReadBuffer(buf); // 向蓝牙设备写数据

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
     * 翻转LED灯
     * @param msg[0] led x坐标
     * @param msg[1] led y坐标
     * @returns 返回1
     */
    function ledToggle(msg: number[]): number[] {
        led.toggle(msg[0], msg[1]);
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

            bleInitFlag = 1;
        }
    }
}