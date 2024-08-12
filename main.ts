

/**
* Functions to BluetoothInteraction by ELECFREAKS Co.,Ltd.
*/
//% color=#00B1ED  icon="\uf005" block="BluetoothInteraction" blockId="BluetoothInteraction"
namespace BluetoothInteraction {

    let bleInitFlag = 0;
    let bleConnFalg = 0;
    let bleMsgState = 0;
    let bleMsgCode = 0;
    let bleMsgLength = 0;
    let bleMsgBuf = [];
    let bleMsgBufIndex = 0;

    function handleBluetoothData(data: number) {
        switch (bleMsgState) {
            case 0:
                if (data == 0xFF) {
                    bleMsgState = 1;
                    bleMsgBufIndex = 0;
                }
                break;
            case 1:
                if (data == 0xF9) {
                    bleMsgState = 2;
                }
                break;
            case 2:
                bleMsgCode = data;
                bleMsgState = 3;
                break;
            case 3:
                bleMsgLength = data;
                bleMsgState = 4;
                break;
            case 4:
                bleMsgBuf[bleMsgBufIndex++] = data;
                if (bleMsgLength == bleMsgBufIndex) {
                    bleMsgState = 5;
                }
                break;
            case 5:
                let checksum = 0xFF + 0xF9 + bleMsgCode + bleMsgLength;
                for (let i = 0; i < bleMsgLength; i++) {
                    checksum += bleMsgBuf[i];
                }
                // 指令校验通过，调用对应函数
                if (data == checksum & 0xFF) {
                    handleBleCommand(bleMsgCode, bleMsgBuf);
                }
                break;
            default:
                break;
        }
    }

    function handleBleCommand(code, msg) {
        switch (code) {
            case 0x1:
                break;
            default:
                break;
        }
    }

    /**
     * 初始化蓝牙模块
     */
    export function bluetoothServerInit() {
        if (bleInitFlag == 0) {

            bluetooth.startUartService()
            bluetooth.setTransmitPower(7)
            bluetooth.onBluetoothConnected(function () {
                bleConnFalg = 1;
            })
            bluetooth.onBluetoothDisconnected(function () {
                bleConnFalg = 0;
            })

            control.inBackground(function () {
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

            bleInitFlag = 1;
        }
    }


}