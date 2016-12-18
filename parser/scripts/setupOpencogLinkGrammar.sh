#
# See: https://github.com/opencog/link-grammar/issues/289
#

cd ../../


#
# DEPENDENCIES
#

# See https://github.com/opencog/link-grammar/blob/master/docker/docker-python/Dockerfile
sudo apt-get install -y automake autoconf-archive build-essential libtool swig swig2.0 python-dev zlib1g-dev

# Remove conflicting pkgs from pylinkgrammar 
# See https://groups.google.com/d/msg/link-grammar/gc4PlpaTDIg/v0m-IOuVAQAJ
sudo apt-get remove pylink
sudo apt-get remove liblink-grammar4-dev
sudo apt-get remove liblink-grammar4
sudo apt-get autoremove

#
# DOWNLOAD
#
wget https://github.com/opencog/link-grammar/archive/link-grammar-5.3.4.tar.gz && \
   tar -zxvf link-grammar-5.3.4.tar.gz && \
   cd link-grammar-link-grammar-5.3.4

#
# INSTALL
#
./autogen.sh --enable-python-bindings --disable-java-bindings && \
   ./configure --enable-python-bindings --disable-java-bindings && \
   make -j12 && \
   sudo make install && \
   sudo ldconfig && \
   echo "export LANG=en_US.UTF-8" >> ~/.bashrc && \
   . ~/.bashrc && \
   echo "this is a test" | link-parser && \
   ./bindings/python-examples/example.py && \
   ./bindings/python-examples/tests.py

