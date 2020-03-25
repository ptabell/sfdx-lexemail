import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { RecordResult, SuccessResult, ErrorResult } from '../../../node_modules/@types/jsforce/record-result';
import {existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('sfdx-lexemail', 'push');

export default class Push extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [messages.getMessage('commandExample')];

  public static args = [];

  protected static flagsConfig = {
    emaildir : flags.directory({
      char : 'd',
      description : messages.getMessage('emailDirectoryDesc')
    })
  };

  // Comment this out if your command does not require an org username
  protected static requiresUsername = true;

  // Comment this out if your command does not support a hub org username
  protected static supportsDevhubUsername = false;

  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  protected static requiresProject = true;

  public async run(): Promise<AnyJson> {

    let emailDirPath = this.flags.emaildir;
    if(!emailDirPath){
      if(this.project){
        let projectConfig = await this.project.resolveProjectConfig();
        if(projectConfig && Array.isArray(projectConfig.packageDirectories)){
          for(let packageDir of projectConfig.packageDirectories){
            if(packageDir['default']){
              emailDirPath = packageDir['path'];
              if(!emailDirPath.endsWith('/'))emailDirPath+='/';
              emailDirPath+='emails/';
            }
          }
        }
      }
    }

    if(!emailDirPath){
      throw new SfdxError(messages.getMessage('emailDirRequired'), 'EmailDirRequired');
    }
    if(!emailDirPath.endsWith('/'))emailDirPath+='/';
    
    if(!existsSync(emailDirPath)){
      mkdirSync(emailDirPath);
    }
    const fDirPath = emailDirPath+'folders/';
    const elDirPath = emailDirPath+'enhancedletterheads/';
    const etDirPath = emailDirPath+'emailtemplates/';

    if(!existsSync(fDirPath))mkdirSync(fDirPath);
    if(!existsSync(elDirPath))mkdirSync(elDirPath);
    if(!existsSync(etDirPath))mkdirSync(etDirPath);

    // this.org is guaranteed because requiresUsername=true, as opposed to supportsUsername
    const conn = this.org.getConnection();
    const fQuery = 'SELECT Id,Name,DeveloperName,AccessType,Type,ParentId FROM Folder WHERE Type=\'EmailTemplate\'';
    const elQuery = 'SELECT Id,Name,Description,LetterheadHeader,LetterheadFooter FROM EnhancedLetterhead';
    const etQuery = 'SELECT Id,ApiVersion,Body,Description,DeveloperName,Encoding,EnhancedLetterheadId,FolderId,HtmlValue,Name,RelatedEntityType,Subject,TemplateType,UIType FROM EmailTemplate WHERE UIType=\'SFX\'';

    interface FolderCore {
      Id : string;
      Name: string;
      DeveloperName : string;
      AccessType : string;
    }

    interface Folder extends FolderCore{
      Type : string;
    }

    interface EnhancedLetterhead{
      Id : string;
      Name : string;
      Description : string;
      LetterheadHeader : string;
      LetterheadFooter : string;
    }

    interface EmailTemplateCore{
      Id : string;
      ApiVersion : string;
      Body : string;
      Description : string;
      DeveloperName : string;
      Encoding : string;
      EnhancedLetterheadId : string;
      FolderId : string;
      HtmlValue : string;
      Name : string;
      RelatedEntityType : string;
      Subject : string;
    }

    interface EmailTemplate extends EmailTemplateCore{
      TemplateType : string;
      UIType : string;
    }

    // Query the objects
    const fRes = await conn.query<Folder>(fQuery);
    const elRes = await conn.query<EnhancedLetterhead>(elQuery);
    const etRes = await conn.query<EmailTemplate>(etQuery);

    //Mapping current values in org
    let fDevNameMap = new Map();
    let elNameMap = new Map();
    let etDevNameMap = new Map
    if(fRes.records){
      for(let fRec of fRes.records){
        fDevNameMap.set(fRec.DeveloperName,fRec.Id);
      }
    }
    if(elRes.records){
      for(let elRec of elRes.records){
        elNameMap.set(elRec.Name,elRec.Id);
      }
    }
    if(etRes.records){
      for(let etRec of etRes.records){
        etDevNameMap.set(etRec.DeveloperName,etRec.Id);
      }
    }
    let folderRecs = new Array<FolderCore>();
    let includedFolderDevNames = new Map();
    const fFiles = readdirSync(fDirPath);
    for(let fFile of fFiles){
      if(fFile!='.' && fFile!='..'){
        let fRec : Folder = JSON.parse(readFileSync(fDirPath+fFile,'utf8'));
        fRec.Id = fDevNameMap.has(fRec.DeveloperName) ? fDevNameMap.get(fRec.DeveloperName) : null;
        includedFolderDevNames.set(fRec.DeveloperName,true);
        if(fRec.Id==null)folderRecs.push(fRec);
        else {
          delete fRec.Type;
          folderRecs.push(fRec as FolderCore);
        }
      }
    }
    /*
    REMOVED recursive folder support since parentId was not allowed to be modified
    let folderRecsLevel = new Array<FolderCore>();
    for(let fRec of folderRecs){
      if(fRec.ParentId==null){
        folderRecsLevel.push(fRec);
      }
      else if(fDevNameMap.has(fRec.ParentId)){
        fRec.ParentId = fDevNameMap.get(fRec.ParentId);
        folderRecsLevel.push(fRec);
      }
      else if(!includedFolderDevNames.has(fRec.ParentId)){
        fRec.ParentId=null;
        folderRecsLevel.push(fRec);
      }
    }

    while(folderRecsLevel.length>0){
      let folderRecsLevelIns = new Array<FolderCore>();
      let folderRecsLevelUpd = new Array<FolderCore>();
      for(let fRec of folderRecsLevel){
        if(fRec.Id==null)folderRecsLevelIns.push(fRec);
        else folderRecsLevelUpd.push(fRec);
      }
      let devNameLevelMap = new Map();
      if(folderRecsLevelIns.length>0){
        let recordResult =((await conn.insert('Folder',folderRecsLevelIns)) as RecordResult[]);
        for(let i=0;i<folderRecsLevelIns.length;i++){
          let recRes = recordResult[i];
          let fRec = folderRecsLevelIns[i];
          if(recRes.success){
            let recId = (recRes as SuccessResult).id;
            devNameLevelMap.set(fRec.DeveloperName,recId);
            fDevNameMap.set(fRec.DeveloperName,recId);
          }
          else {
            throw new SfdxError('Error upserting folder: '+fRec.DeveloperName+' : '+JSON.stringify((recRes as ErrorResult).errors),'DML_ERROR');
          }
        }
      }
      if(folderRecsLevelUpd.length>0){
        let recordResult =((await conn.update('Folder',folderRecsLevelUpd)) as RecordResult[]);
        for(let i=0;i<folderRecsLevelUpd.length;i++){
          let recRes = recordResult[i];
          let fRec = folderRecsLevelUpd[i];
          if(recRes.success){
            let recId = (recRes as SuccessResult).id;
            devNameLevelMap.set(fRec.DeveloperName,recId);
            fDevNameMap.set(fRec.DeveloperName,recId);
          }
          else {
            throw new SfdxError('Error upserting folder: '+fRec.DeveloperName+' : '+JSON.stringify((recRes as ErrorResult).errors),'DML_ERROR');
          }
        }
      }
      
      
      folderRecsLevel = new Array<Folder>();
      for(let fRec of folderRecs){
        if(fRec.ParentId!=null && devNameLevelMap.has(fRec.ParentId)){
          fRec.ParentId = fDevNameMap.get(fRec.ParentId);
          folderRecsLevel.push(fRec);
        }
      }
    }
    */
    if(folderRecs.length>0){
      let folderRecsIns = new Array<FolderCore>();
      let folderRecsUpd = new Array<FolderCore>();
      for(let fRec of folderRecs){
        if(fRec.Id==null)folderRecsIns.push(fRec);
        else folderRecsUpd.push(fRec);
      }

      if(folderRecsIns.length>0){
        let recordResult =((await conn.insert('Folder',folderRecsIns)) as RecordResult[]);
        for(let i=0;i<folderRecsIns.length;i++){
          let recRes = recordResult[i];
          let fRec = folderRecsIns[i];
          if(recRes.success){
            let recId = (recRes as SuccessResult).id;
            fDevNameMap.set(fRec.DeveloperName,recId);
          }
          else {
            throw new SfdxError('Error upserting folder: '+fRec.DeveloperName+' : '+JSON.stringify((recRes as ErrorResult).errors),'DML_ERROR');
          }
        }
      }
      if(folderRecsUpd.length>0){
        let recordResult =((await conn.update('Folder',folderRecsUpd)) as RecordResult[]);
        for(let i=0;i<folderRecsUpd.length;i++){
          let recRes = recordResult[i];
          let fRec = folderRecsUpd[i];
          if(recRes.success){
            let recId = (recRes as SuccessResult).id;
            fDevNameMap.set(fRec.DeveloperName,recId);
          }
          else {
            throw new SfdxError('Error upserting folder: '+fRec.DeveloperName+' : '+JSON.stringify((recRes as ErrorResult).errors),'DML_ERROR');
          }
        }
      }
    }

    let elRecs = new Array<EnhancedLetterhead>();
    const elFiles = readdirSync(elDirPath);
    for(let elFile of elFiles){
      if(elFile!='.' && elFile!='..'){
        let elRec : EnhancedLetterhead = JSON.parse(readFileSync(elDirPath+elFile,'utf8'));
        elRec.Id = elNameMap.has(elRec.Name) ? elNameMap.get(elRec.Name) : null;
        elRecs.push(elRec);
      }
    }
    if(elRecs.length>0){
      let elRecsIns = new Array<EnhancedLetterhead>();
      let elRecsUpd = new Array<EnhancedLetterhead>();
      for(let elRec of elRecs){
        if(elRec.Id==null)elRecsIns.push(elRec);
        else elRecsUpd.push(elRec);
      }

      if(elRecsIns.length>0){
        let recordResult =((await conn.insert('EnhancedLetterhead',elRecsIns)) as RecordResult[]);
        for(let i=0;i<elRecsIns.length;i++){
          let recRes = recordResult[i];
          let elRec = elRecsIns[i];
          if(recRes.success){
            elNameMap.set(elRec.Name,(recRes as SuccessResult).id);
          }
          else {
            throw new SfdxError('Error upserting enhancedletterhead: '+elRec.Name+' : '+JSON.stringify((recRes as ErrorResult).errors),'DML_ERROR');
          }
        }
      }
      if(elRecsUpd.length>0){
        let recordResult =((await conn.update('EnhancedLetterhead',elRecsUpd)) as RecordResult[]);
        for(let i=0;i<elRecsUpd.length;i++){
          let recRes = recordResult[i];
          let elRec = elRecsUpd[i];
          if(recRes.success){
            elNameMap.set(elRec.Name,(recRes as SuccessResult).id);
          }
          else {
            throw new SfdxError('Error upserting enhancedletterhead: '+elRec.Name+' : '+JSON.stringify((recRes as ErrorResult).errors),'DML_ERROR');
          }
        }
      }

      
    }

    let etRecs = new Array<EmailTemplateCore>();
    const etFiles = readdirSync(etDirPath);
    for(let etFile of etFiles){
      if(etFile!='.' && etFile!='..'){
        let etRec : EmailTemplate = JSON.parse(readFileSync(etDirPath+etFile,'utf8'));
        etRec.Id = etDevNameMap.has(etRec.DeveloperName) ? etDevNameMap.get(etRec.DeveloperName) : null;
        etRec.FolderId = fDevNameMap.has(etRec.FolderId) ? fDevNameMap.get(etRec.FolderId) : null;
        etRec.EnhancedLetterheadId = elNameMap.has(etRec.EnhancedLetterheadId) ? elNameMap.get(etRec.EnhancedLetterheadId) : null;
        if(etRec.Id==null){
          etRecs.push(etRec);
        }
        else {
          delete etRec.TemplateType;
          delete etRec.UIType;
          etRecs.push(etRec as EmailTemplateCore)
        }
      }
    }
    if(etRecs.length>0){
      let etRecsIns = new Array<EmailTemplateCore>();
      let etRecsUpd = new Array<EmailTemplateCore>();
      for(let etRec of etRecs){
        if(etRec.Id==null)etRecsIns.push(etRec);
        else etRecsUpd.push(etRec);
      }
      if(etRecsIns.length>0){
        let recordResult =((await conn.insert('EmailTemplate',etRecsIns)) as RecordResult[]);
        for(let i=0;i<etRecsIns.length;i++){
          let recRes = recordResult[i];
          let etRec = etRecsIns[i];
          if(recRes.success){
            etDevNameMap.set(etRec.DeveloperName,(recRes as SuccessResult).id);
          }
          else {
            throw new SfdxError('Error upserting emailtemplate: '+etRec.DeveloperName+' : '+JSON.stringify((recRes as ErrorResult).errors),'DML_ERROR');
          }
        }
      }
      if(etRecsUpd.length>0){
        let recordResult =((await conn.update('EmailTemplate',etRecsUpd)) as RecordResult[]);
        for(let i=0;i<etRecsUpd.length;i++){
          let recRes = recordResult[i];
          let etRec = etRecsUpd[i];
          if(recRes.success){
            etDevNameMap.set(etRec.DeveloperName,(recRes as SuccessResult).id);
          }
          else {
            throw new SfdxError('Error upserting emailtemplate: '+etRec.DeveloperName+' : '+JSON.stringify((recRes as ErrorResult).errors),'DML_ERROR');
          }
        }
      }
      
    }
    return {};
  }
}
