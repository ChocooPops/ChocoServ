import { Injectable } from "@nestjs/common";
import { IntervalShowed } from "src/media/dto/interval-showed.interface";

@Injectable({})
export class VerifTimerShowService {

  public convertTimerInSecond(timer: string): number {
    if (timer) {
      const time: string[] = this.getGoodFormat(timer).split(':');
      if (time.length >= 3) {
        const [hour, minute, second] = time;
        const totalSeconds = parseInt(hour) * 3600 + parseInt(minute) * 60 + parseInt(second);
        return totalSeconds;
      } else {
        return 0;
      }
    } else {
      return 0;
    }
  }

  public convertSecondInGoodFormatTimer(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0')
    ].join(':');
  }

  public getGoodFormat(time: string): string {
    let timerTab: string[] = [];
    if (time && time != undefined) {
      timerTab = time.split(':');
    }
    if (timerTab.length === 3) {
      return time;
    } else {
      return '00:00:00';
    }
  }

  public getGoodIntervalWhenMovieShowed(start: string, end: string): IntervalShowed {
    const defautlStart: string = this.convertSecondInGoodFormatTimer(1200);
    const defaultEnd: string = this.convertSecondInGoodFormatTimer(1290);
    let finalStart !: string;
    let finalEnd !: string;
    if (end == null || end == undefined || start == null || start == undefined) {
      finalStart = defautlStart;
      finalEnd = defaultEnd;
    } else {
      start = this.getGoodFormat(start);
      end = this.getGoodFormat(end);
      const secondStart: number = this.convertTimerInSecond(start);
      const secondEnd: number = this.convertTimerInSecond(end);
      if (secondStart >= secondEnd) {
        finalStart = start;
        finalEnd = this.convertSecondInGoodFormatTimer(secondStart + 90);
      } else if (end === this.convertSecondInGoodFormatTimer(0)) {
        finalStart = defautlStart;
        finalEnd = defaultEnd;
      } else {
        finalStart = start;
        finalEnd = end;
      }
    }
    const interval: IntervalShowed = {
      start: finalStart,
      end: finalEnd
    }
    return interval;
  }

}
