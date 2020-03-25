import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import {existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('sfdx-lexemail', 'pull');

export default class Pull extends SfdxCommand {

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

    // The type we are querying for
    interface Folder {
      Id : string;
      Name: string;
      DeveloperName : string;
      AccessType : string;
      Type : string;
    }

    interface EnhancedLetterhead{
      Id : string;
      Name : string;
      Description : string;
      LetterheadHeader : string;
      LetterheadFooter : string;
    }

    interface EmailTemplate{
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
      TemplateType : string;
      UIType : string;
    }

    // Query the objects
    const fRes = await conn.query<Folder>(fQuery);
    const elRes = await conn.query<EnhancedLetterhead>(elQuery);
    const etRes = await conn.query<EmailTemplate>(etQuery);

    //Removing al current files
    const fFiles = readdirSync(fDirPath);
    for(let fFile of fFiles){
      if(fFile!='.' && fFile!='..')unlinkSync(fDirPath+fFile);
    }
    const elFiles = readdirSync(elDirPath);
    for(let elFile of elFiles){
      if(elFile!='.' && elFile!='..')unlinkSync(elDirPath+elFile);
    }
    const etFiles = readdirSync(etDirPath);
    for(let etFile of etFiles){
      if(etFile!='.' && etFile!='..')unlinkSync(etDirPath+etFile);
    }

    //Writing new files
    let fIdMap = new Map();
    let elIdMap = new Map();
    if(fRes.records){
      for(let fRec of fRes.records){
        fIdMap.set(fRec.Id,fRec.DeveloperName);
      }
      for(let fRec of fRes.records){
        //Removed parent id since writing parent id is not supported
        //fRec.ParentId = fIdMap.has(fRec.ParentId) ? fIdMap.get(fRec.ParentId) : null;
        fRec.Id = null;
        writeFileSync(fDirPath+fRec.DeveloperName+'.json',JSON.stringify(fRec,null,2));
      }
    }
    if(elRes.records){
      for(let elRec of elRes.records){
        elIdMap.set(elRec.Id,elRec.Name);
      }
      for(let elRec of elRes.records){
        elRec.Id = null;
        writeFileSync(elDirPath+elRec.Name+'.json',JSON.stringify(elRec,null,2));
      }
    }
    if(etRes.records){
      for(let etRec of etRes.records){
        etRec.FolderId = fIdMap.has(etRec.FolderId) ? fIdMap.get(etRec.FolderId) : null;
        etRec.EnhancedLetterheadId = elIdMap.has(etRec.EnhancedLetterheadId) ? elIdMap.get(etRec.EnhancedLetterheadId) : null;
        etRec.Id = null;
        writeFileSync(etDirPath+etRec.Name+'.json',JSON.stringify(etRec,null,2));
      }
    }
    return {};
  }
}
