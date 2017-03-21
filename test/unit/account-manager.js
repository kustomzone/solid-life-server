'use strict'

const path = require('path')
const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)
chai.should()

const rdf = require('rdflib')
const LDP = require('../../lib/ldp')
const SolidHost = require('../../lib/models/solid-host')
const AccountManager = require('../../lib/models/account-manager')
const UserAccount = require('../../lib/models/user-account')
const WebIdTlsCertificate = require('../../lib/models/webid-tls-certificate')

const testAccountsDir = path.join(__dirname, '../resources/accounts')

var host

beforeEach(() => {
  host = SolidHost.from({ serverUri: 'https://example.com' })
})

describe('AccountManager', () => {
  describe('from()', () => {
    it('should init with passed in options', () => {
      let config = {
        host,
        authMethod: 'tls',
        multiUser: true,
        store: {},
        emailService: {}
      }

      let mgr = AccountManager.from(config)
      expect(mgr.host).to.equal(config.host)
      expect(mgr.authMethod).to.equal(config.authMethod)
      expect(mgr.multiUser).to.equal(config.multiUser)
      expect(mgr.store).to.equal(config.store)
      expect(mgr.emailService).to.equal(config.emailService)
    })

    it('should error if no host param is passed in', () => {
      expect(() => { AccountManager.from() })
        .to.throw(/AccountManager requires a host instance/)
    })
  })

  describe('accountUriFor', () => {
    it('should compose account uri for an account in multi user mode', () => {
      let options = {
        multiUser: true,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      let mgr = AccountManager.from(options)

      let webId = mgr.accountUriFor('alice')
      expect(webId).to.equal('https://alice.localhost')
    })

    it('should compose account uri for an account in single user mode', () => {
      let options = {
        multiUser: false,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      let mgr = AccountManager.from(options)

      let webId = mgr.accountUriFor('alice')
      expect(webId).to.equal('https://localhost')
    })
  })

  describe('accountWebIdFor()', () => {
    it('should compose a web id uri for an account in multi user mode', () => {
      let options = {
        multiUser: true,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      let mgr = AccountManager.from(options)
      let webId = mgr.accountWebIdFor('alice')
      expect(webId).to.equal('https://alice.localhost/profile/card#me')
    })

    it('should compose a web id uri for an account in single user mode', () => {
      let options = {
        multiUser: false,
        host: SolidHost.from({ serverUri: 'https://localhost' })
      }
      let mgr = AccountManager.from(options)
      let webId = mgr.accountWebIdFor('alice')
      expect(webId).to.equal('https://localhost/profile/card#me')
    })
  })

  describe('accountDirFor()', () => {
    it('should match the solid root dir config, in single user mode', () => {
      let multiUser = false
      let store = new LDP({ root: testAccountsDir, idp: multiUser })
      let options = { multiUser, store, host }
      let accountManager = AccountManager.from(options)

      let accountDir = accountManager.accountDirFor('alice')
      expect(accountDir).to.equal(store.root)
    })

    it('should compose the account dir in multi user mode', () => {
      let multiUser = true
      let store = new LDP({ root: testAccountsDir, idp: multiUser })
      let host = SolidHost.from({ serverUri: 'https://localhost' })
      let options = { multiUser, store, host }
      let accountManager = AccountManager.from(options)

      let accountDir = accountManager.accountDirFor('alice')
      expect(accountDir).to.equal(path.join(testAccountsDir, 'alice.localhost'))
    })
  })

  describe('userAccountFrom()', () => {
    describe('in multi user mode', () => {
      let multiUser = true

      it('should throw an error if no username is passed', () => {
        let options = { host, multiUser }
        let accountManager = AccountManager.from(options)

        expect(() => {
          accountManager.userAccountFrom({})
        }).to.throw(Error)
      })

      it('should init webId from param if no username is passed', () => {
        let options = { host, multiUser }
        let accountManager = AccountManager.from(options)

        let userData = { webid: 'https://example.com' }
        let newAccount = accountManager.userAccountFrom(userData)
        expect(newAccount.webId).to.equal(userData.webid)
      })
    })

    describe('in single user mode', () => {
      let multiUser = false

      it('should not throw an error if no username is passed', () => {
        let options = { host, multiUser }
        let accountManager = AccountManager.from(options)

        expect(() => {
          accountManager.userAccountFrom({})
        }).to.not.throw(Error)
      })
    })
  })

  describe('addCertKeyToProfile()', () => {
    let accountManager, certificate, userAccount, profileGraph

    beforeEach(() => {
      let options = { host }
      accountManager = AccountManager.from(options)
      userAccount = accountManager.userAccountFrom({ username: 'alice' })
      certificate = WebIdTlsCertificate.fromSpkacPost('1234', userAccount, host)
      profileGraph = {}
    })

    it('should fetch the profile graph', () => {
      accountManager.getProfileGraphFor = sinon.stub().returns(Promise.resolve())
      accountManager.addCertKeyToGraph = sinon.stub()
      accountManager.saveProfileGraph = sinon.stub()

      return accountManager.addCertKeyToProfile(certificate, userAccount)
        .then(() => {
          expect(accountManager.getProfileGraphFor).to
            .have.been.calledWith(userAccount)
        })
    })

    it('should add the cert key to the account graph', () => {
      accountManager.getProfileGraphFor = sinon.stub()
        .returns(Promise.resolve(profileGraph))
      accountManager.addCertKeyToGraph = sinon.stub()
      accountManager.saveProfileGraph = sinon.stub()

      return accountManager.addCertKeyToProfile(certificate, userAccount)
        .then(() => {
          expect(accountManager.addCertKeyToGraph).to
            .have.been.calledWith(certificate, profileGraph)
          expect(accountManager.addCertKeyToGraph).to
            .have.been.calledAfter(accountManager.getProfileGraphFor)
        })
    })

    it('should save the modified graph to the profile doc', () => {
      accountManager.getProfileGraphFor = sinon.stub()
        .returns(Promise.resolve(profileGraph))
      accountManager.addCertKeyToGraph = sinon.stub()
        .returns(Promise.resolve(profileGraph))
      accountManager.saveProfileGraph = sinon.stub()

      return accountManager.addCertKeyToProfile(certificate, userAccount)
        .then(() => {
          expect(accountManager.saveProfileGraph).to
            .have.been.calledWith(profileGraph, userAccount)
          expect(accountManager.saveProfileGraph).to
            .have.been.calledAfter(accountManager.addCertKeyToGraph)
        })
    })
  })

  describe('getProfileGraphFor()', () => {
    it('should throw an error if webId is missing', (done) => {
      let emptyUserData = {}
      let userAccount = UserAccount.from(emptyUserData)
      let options = { host, multiUser: true }
      let accountManager = AccountManager.from(options)

      accountManager.getProfileGraphFor(userAccount)
        .catch(error => {
          expect(error.message).to
            .equal('Cannot fetch profile graph, missing WebId URI')
          done()
        })
    })

    it('should fetch the profile graph via LDP store', () => {
      let store = {
        getGraph: sinon.stub().returns(Promise.resolve())
      }
      let webId = 'https://alice.example.com/#me'
      let profileHostUri = 'https://alice.example.com/'

      let userData = { webId }
      let userAccount = UserAccount.from(userData)
      let options = { host, multiUser: true, store }
      let accountManager = AccountManager.from(options)

      expect(userAccount.webId).to.equal(webId)

      return accountManager.getProfileGraphFor(userAccount)
        .then(() => {
          expect(store.getGraph).to.have.been.calledWith(profileHostUri)
        })
    })
  })

  describe('saveProfileGraph()', () => {
    it('should save the profile graph via the LDP store', () => {
      let store = {
        putGraph: sinon.stub().returns(Promise.resolve())
      }
      let webId = 'https://alice.example.com/#me'
      let profileHostUri = 'https://alice.example.com/'

      let userData = { webId }
      let userAccount = UserAccount.from(userData)
      let options = { host, multiUser: true, store }
      let accountManager = AccountManager.from(options)
      let profileGraph = rdf.graph()

      return accountManager.saveProfileGraph(profileGraph, userAccount)
        .then(() => {
          expect(store.putGraph).to.have.been.calledWith(profileGraph, profileHostUri)
        })
    })
  })
})
