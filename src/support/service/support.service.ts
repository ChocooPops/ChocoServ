import { Injectable } from '@nestjs/common';
import { MailService } from 'src/common-service/mail.service';
import { Support } from '../dto/support.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { FormSupport } from '../dto/form-support.interface';
import { I18nService, I18nContext } from 'nestjs-i18n';

@Injectable()
export class SupportService {

    constructor(private readonly mailService: MailService,
        private readonly i18nService: I18nService
    ) { }

    private getSupportTabValue(lang: any): Support[] {
        return [
            {
                id: 0,
                subject: this.i18nService.t('common.SUPPORT.BUG_SUBJECT', { lang }),
                areaConcerned: [
                    this.i18nService.t('common.SUPPORT.AREA.HOME_PAGE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.MOVIES_PAGE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.SERIES_PAGE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.SEARCH_PAGE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.LICENSES_PAGE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.EDITION_PAGE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.VIDEO_PLAYER', { lang }),
                ]
            },
            {
                id: 1,
                subject: this.i18nService.t('common.SUPPORT.ARCHITECTURE_SUBJECT', { lang }),
                areaConcerned: [
                    this.i18nService.t('common.SUPPORT.AREA.HOME_PAGE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.MOVIES_PAGE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.SERIES_PAGE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.SEARCH_PAGE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.LICENSES_PAGE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.EDITION_PAGE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.VIDEO_PLAYER_PAGE', { lang }),
                ]
            },
            {
                id: 2,
                subject: this.i18nService.t('common.SUPPORT.ADD_CONTENT_SUBJECT', { lang }),
                areaConcerned: [
                    this.i18nService.t('common.SUPPORT.AREA.ADD_NEW_MOVIE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.ADD_MOVIE_TO_SELECTION', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.ADD_NEW_SERIES', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.ADD_SERIES_TO_SELECTION', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.ADD_NEW_LICENSE', { lang }),
                ]
            },
            {
                id: 3,
                subject: this.i18nService.t('common.SUPPORT.MODIFY_CONTENT_SUBJECT', { lang }),
                areaConcerned: [
                    this.i18nService.t('common.SUPPORT.AREA.EDIT_LICENSE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.EDIT_MOVIE', { lang }),
                    this.i18nService.t('common.SUPPORT.AREA.EDIT_SERIES', { lang }),
                ]
            }
        ]
    }

    public getAllFormToSupport(): Support[] {
        const lang = I18nContext.current()?.lang;
        return this.getSupportTabValue(lang);
    }

    public async sendFormByEmail(form: FormSupport): Promise<ReturnMessage> {
        const lang = I18nContext.current()?.lang;

        if (form.subject && form.subject.trim() !== "") {
            if (form.areaConcerned && form.areaConcerned.trim() !== "") {
                if (form.description && form.description.trim() !== "" && form.description.length > 20) {
                    await this.mailService.sendFormulaire(form, lang);
                    return {
                        id: 0,
                        message: this.i18nService.t("common.SUPPORT.FORM_SUBMITTED"),
                        state: true
                    }
                } else {
                    return {
                        id: -1,
                        message: this.i18nService.t("common.SUPPORT.DESCRIPTION_CANNOT_EMPTY_INSUFFICIENT"),
                        state: false
                    }
                }
            } else {
                return {
                    id: -1,
                    message: this.i18nService.t("common.SUPPORT.REQUIERED_FIELD"),
                    state: false
                }
            }
        } else {
            return {
                id: -1,
                message: this.i18nService.t("common.SUPPORT.SUBJECT_CANNOT_EMPTY"),
                state: false,
            }
        }
    }
}
