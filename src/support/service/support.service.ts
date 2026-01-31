import { Injectable } from '@nestjs/common';
import { MailService } from 'src/common-service/mail.service';
import { Support } from '../dto/support.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { FormSupport } from '../dto/form-support.interface';

@Injectable()
export class SupportService {

    private supportTab: Support[] = [
        {
            id: 0,
            subject: "Bug & Dysfonctionnement",
            areaConcerned: [
                "Page d’accueil",
                "Page des films",
                "Page des séries",
                "Page de recherche",
                "Page des licenses",
                "Page d’edition",
                "Lecture de la vidéo"
            ]
        },
        {
            id: 1,
            subject: "Amélioration de l’architecture / ergonomie",
            areaConcerned: [
                "Page d’accueil",
                "Page des films",
                "Page des séries",
                "Page de recherche",
                "Page des licenses",
                "Page d’edition",
                "Page de lecture de la vidéo"
            ]
        },
        {
            id: 2,
            subject: "Demande d’ajout de contenu",
            areaConcerned: [
                "Ajouter un nouveau film sur la plateforme",
                "Ajouter un film dans une sélection",
                "Ajouter une nouvelle série sur la plateforme",
                "Ajouter une série dans une sélection",
                "Ajouter une nouvelle license"
            ]
        },
        {
            id: 3,
            subject: "Demande de modification du contenu",
            areaConcerned: [
                "Modifier une license (titre, background, logo)",
                "Modifier une film (titre, catégorie, background, logo, affiche)",
                "Modifier une série (titre, catégorie, background, affiche)"
            ]
        }
    ]

    constructor(private mailService: MailService) { }

    public getAllFormToSupport(): Support[] {
        return this.supportTab
    }

    public async sendFormByEmail(form: FormSupport): Promise<ReturnMessage> {
        if (form.subject && form.subject.trim() !== "") {
            if (form.areaConcerned && form.areaConcerned.trim() !== "") {
                if (form.description && form.description.trim() !== "" && form.description.length > 20) {
                    await this.mailService.sendFormulaire(form);
                    return {
                        id: 0,
                        message: "Le formulaire a été envoyé",
                        state: true
                    }
                } else {
                    return {
                        id: -1,
                        message: "La description ne doit pas être vide ou est insuffisante",
                        state: false
                    }
                }
            } else {
                return {
                    id: -1,
                    message: "La zone concernée n'a pas été indiquée",
                    state: false
                }
            }
        } else {
            return {
                id: -1,
                message: 'Le sujet ne peut pas être vide',
                state: false,
            }
        }
    }
}
